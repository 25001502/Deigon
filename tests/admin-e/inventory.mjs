import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { after, before, mock, test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";
import { database } from "../admin-b1/support/database.mjs";

const context = new AsyncLocalStorage();
const origin = "https://admin-e.example.invalid";
const originalOrigin = process.env.APP_URL;
let handle, db, pool, app, admin, customer, category;

function transactionAwareClient(client) {
  return new Proxy(client, {
    get(target, property) {
      if (property === "$transaction") {
        return (operation, options) => {
          if (typeof operation !== "function") return target.$transaction(operation, options);
          return target.$transaction(async (tx) => {
            const store = context.getStore();
            if (!store?.failHistoryInsert) return operation(tx);
            const wrapped = new Proxy(tx, {
              get(txTarget, txProperty) {
                if (txProperty !== "inventoryAdjustment") return Reflect.get(txTarget, txProperty);
                return new Proxy(txTarget.inventoryAdjustment, {
                  get(model, method) {
                    if (method === "create") return async () => { throw new Error("TEST ONLY history insert failure"); };
                    const value = Reflect.get(model, method); return typeof value === "function" ? value.bind(model) : value;
                  },
                });
              },
            });
            return operation(wrapped);
          }, options);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const as = (user, action, extra = {}) => context.run({ user, ...extra }, action);
const asAdmin = (action, extra) => as(admin, action, extra);

function request(path, method = "GET", body, headers = {}) {
  return new Request(`${origin}${path}`, {
    method,
    headers: body === undefined ? { Origin: origin, ...headers } : { Origin: origin, "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function fixture({ quantity = 8, isActive = true, missingInventory = false, prefix = randomUUID() } = {}) {
  const product = await db.product.create({ data: {
    name: `Inventory product ${prefix}`, slug: `inventory-${prefix}`, isActive, categoryId: category.id,
  } });
  const variant = await db.productVariant.create({
    data: {
      productId: product.id, sku: `INV-${prefix}`, size: "M", color: "Black", price: "499.95",
      ...(missingInventory ? {} : { inventory: { create: { quantity } } }),
    },
    include: { inventory: true },
  });
  return { product, variant };
}

function adjustment(f, overrides = {}) {
  return {
    idempotencyKey: randomUUID(),
    expectedQuantity: f.variant.inventory.quantity,
    expectedUpdatedAt: f.variant.inventory.updatedAt.toISOString(),
    delta: 5,
    reason: "RESTOCK",
    note: "Admin E test",
    ...overrides,
  };
}

before(async () => {
  handle = await database(); db = handle.db; pool = handle.pool;
  admin = await db.user.create({ data: { id: randomUUID(), email: "admin-e@example.invalid", role: "ADMIN" } });
  customer = await db.user.create({ data: { id: randomUUID(), email: "customer-e@example.invalid" } });
  category = await db.category.create({ data: { name: "Admin E category", slug: "admin-e-category" } });
  globalThis.__adminE = { client: transactionAwareClient(db), context };
  app = await bundle(`
    export * from './lib/admin/inventory/input';
    export * from './lib/admin/inventory/queries';
    export * from './lib/admin/inventory/mutations';
    export { GET as listGET } from './app/api/admin/inventory/route';
    export { GET as detailGET } from './app/api/admin/inventory/[variantId]/route';
    export { GET as historyGET, POST as adjustmentPOST } from './app/api/admin/inventory/[variantId]/adjustments/route';
    export { createOrder } from './lib/checkout/service';
    export { expireUnpaidOrderCandidate } from './lib/orders/expire-unpaid-orders';
  `, {
    "server-only": "",
    "@/lib/prisma": "export const prisma = globalThis.__adminE.client;",
    "@/lib/supabase/server": `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__adminE.context.getStore()?.user ?? null }, error: null }) } });`,
  });
  process.env.APP_URL = origin;
});

after(async () => {
  if (originalOrigin === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalOrigin;
  delete globalThis.__adminE; await handle?.close();
});

test("migration creates the approved enum, indexes, constraints and no adjustment backfill", async () => {
  const enumValues = (await pool.query(`SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='InventoryAdjustmentReason' ORDER BY enumsortorder`)).rows.map((row) => row.enumlabel);
  assert.deepEqual(enumValues, ["RESTOCK", "CORRECTION", "DAMAGE", "RETURN", "OTHER"]);
  const constraints = (await pool.query(`SELECT conname, pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname LIKE 'Inventory%check' OR conname LIKE 'InventoryAdjustment%fkey' ORDER BY conname`)).rows;
  const serialized = JSON.stringify(constraints);
  for (const name of ["Inventory_quantity_nonnegative_check", "InventoryAdjustment_nonzero_delta_check", "InventoryAdjustment_nonnegative_quantities_check", "InventoryAdjustment_arithmetic_check", "InventoryAdjustment_adminUserId_fkey", "InventoryAdjustment_variantId_fkey"]) assert.match(serialized, new RegExp(name));
  assert.match(serialized, /ON DELETE SET NULL/); assert.match(serialized, /ON DELETE RESTRICT/);
  const indexes = (await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename='InventoryAdjustment' ORDER BY indexname`)).rows.map((row) => row.indexname);
  assert.ok(indexes.includes("InventoryAdjustment_idempotencyKey_key"));
  assert.ok(indexes.includes("InventoryAdjustment_variantId_createdAt_idx"));
  assert.ok(indexes.includes("InventoryAdjustment_adminUserId_createdAt_idx"));
  assert.equal(await db.inventoryAdjustment.count(), 0);
});

test("database CHECK constraints reject negative stock and invalid adjustment arithmetic", async () => {
  const f = await fixture({ quantity: 1 });
  await assert.rejects(pool.query(`UPDATE "Inventory" SET quantity=-1 WHERE "variantId"=$1`, [f.variant.id]), { code: "23514" });
  const values = [randomUUID(), randomUUID(), f.variant.id, admin.id, admin.email, "P", "p", f.variant.sku];
  const insert = (before, delta, after) => pool.query(`INSERT INTO "InventoryAdjustment" (id,"idempotencyKey","variantId","adminUserId","adminEmail","quantityBefore","quantityDelta","quantityAfter",reason,"productName","productSlug",sku,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CORRECTION',$9,$10,$11,NOW())`, [...values.slice(0, 5), before, delta, after, ...values.slice(5)]);
  await assert.rejects(insert(1, 0, 1), { code: "23514" });
  values[1] = randomUUID(); await assert.rejects(insert(1, -2, -1), { code: "23514" });
  values[1] = randomUUID(); await assert.rejects(insert(1, 2, 4), { code: "23514" });
});

test("unauthenticated and CUSTOMER callers are denied by every Admin E API", async () => {
  const f = await fixture(); const body = adjustment(f);
  for (const user of [null, customer]) {
    const status = user ? 403 : 401;
    assert.equal((await as(user, () => app.listGET(request("/api/admin/inventory")))).status, status);
    assert.equal((await as(user, () => app.detailGET(request(`/api/admin/inventory/${f.variant.id}`), { params: Promise.resolve({ variantId: f.variant.id }) }))).status, status);
    assert.equal((await as(user, () => app.historyGET(request(`/api/admin/inventory/${f.variant.id}/adjustments`), { params: Promise.resolve({ variantId: f.variant.id }) }))).status, status);
    assert.equal((await as(user, () => app.adjustmentPOST(request(`/api/admin/inventory/${f.variant.id}/adjustments`, "POST", body), { params: Promise.resolve({ variantId: f.variant.id }) }))).status, status);
  }
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity, 8);
});

test("admin list starts from ProductVariant and filters active, archived, missing, zero and positive stock", async () => asAdmin(async () => {
  const prefix = randomUUID();
  const positive = await fixture({ quantity: 4, prefix: `${prefix}-positive` });
  const zero = await fixture({ quantity: 0, prefix: `${prefix}-zero` });
  const archived = await fixture({ quantity: 2, isActive: false, prefix: `${prefix}-archived` });
  const missing = await fixture({ missingInventory: true, prefix: `${prefix}-missing` });
  const all = await app.listAdminInventory(new URLSearchParams({ search: prefix, limit: "20" }));
  assert.deepEqual(new Set(all.inventory.map((item) => item.variantId)), new Set([positive.variant.id, zero.variant.id, archived.variant.id, missing.variant.id]));
  assert.equal((await app.listAdminInventory(new URLSearchParams({ search: prefix, stock: "MISSING_INVENTORY" }))).inventory[0].variantId, missing.variant.id);
  assert.equal((await app.listAdminInventory(new URLSearchParams({ search: prefix, stock: "OUT_OF_STOCK" }))).inventory[0].variantId, zero.variant.id);
  assert.equal((await app.listAdminInventory(new URLSearchParams({ search: prefix, status: "INACTIVE" }))).inventory[0].variantId, archived.variant.id);
  assert.deepEqual(new Set((await app.listAdminInventory(new URLSearchParams({ search: prefix, stock: "IN_STOCK" }))).inventory.map((item) => item.variantId)), new Set([positive.variant.id, archived.variant.id]));
}));

test("detail and history return only approved inventory audit fields", async () => asAdmin(async () => {
  const f = await fixture();
  const changed = await app.adjustAdminInventory(f.variant.id, adjustment(f, { delta: -2, reason: "DAMAGE", note: "Damaged item" }));
  const detail = await app.getAdminInventory(f.variant.id);
  const history = await app.listAdminInventoryAdjustments(f.variant.id, new URLSearchParams("limit=1"));
  assert.equal(detail.inventory.quantity, 6); assert.equal(detail.product.isActive, true);
  assert.equal(history.adjustments.length, 1); assert.deepEqual(history.adjustments[0], changed.adjustment);
  for (const forbidden of ["adminUserId", "idempotencyKey", "price", "payment", "order", "customer", "providerCheckoutId"]) assert.equal(JSON.stringify({ detail, history }).includes(`\"${forbidden}\"`), false);
}));

test("positive and negative adjustments atomically update stock and immutable snapshots", async () => asAdmin(async () => {
  const f = await fixture({ quantity: 8 });
  const first = await app.adjustAdminInventory(f.variant.id, adjustment(f, { delta: 20, note: " New shipment " }));
  assert.equal(first.replayed, false); assert.equal(first.inventory.inventory.quantity, 28);
  assert.deepEqual({ before: first.adjustment.quantityBefore, delta: first.adjustment.quantityDelta, after: first.adjustment.quantityAfter }, { before: 8, delta: 20, after: 28 });
  assert.equal(first.adjustment.administrator.email, admin.email); assert.equal(first.adjustment.product.name, f.product.name); assert.equal(first.adjustment.variant.sku, f.variant.sku);
  const current = await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } });
  const second = await app.adjustAdminInventory(f.variant.id, adjustment({ ...f, variant: { ...f.variant, inventory: current } }, { delta: -3, reason: "CORRECTION", note: null }));
  assert.equal(second.inventory.inventory.quantity, 25); assert.equal(await db.inventoryAdjustment.count({ where: { variantId: f.variant.id } }), 2);
}));

test("unknown variants, missing Inventory, stale state, negative results and overflow fail without history", async () => asAdmin(async () => {
  await assert.rejects(app.adjustAdminInventory("unknown-variant-id", { ...adjustment(await fixture()), expectedQuantity: 0 }), { status: 404 });
  const missing = await fixture({ missingInventory: true });
  await assert.rejects(app.adjustAdminInventory(missing.variant.id, { ...adjustment(await fixture()), expectedQuantity: 0 }), { status: 409 });
  const f = await fixture({ quantity: 2 });
  await assert.rejects(app.adjustAdminInventory(f.variant.id, adjustment(f, { expectedQuantity: 1 })), { status: 409 });
  await assert.rejects(app.adjustAdminInventory(f.variant.id, adjustment(f, { expectedUpdatedAt: "2026-09-25T12:00:00.000Z" })), { status: 409 });
  await assert.rejects(app.adjustAdminInventory(f.variant.id, adjustment(f, { delta: -3 })), { status: 409 });
  const max = await fixture({ quantity: 2_147_483_647 });
  await assert.rejects(app.adjustAdminInventory(max.variant.id, adjustment(max, { delta: 1 })), { status: 409 });
  assert.equal(await db.inventoryAdjustment.count({ where: { variantId: { in: [f.variant.id, max.variant.id, missing.variant.id] } } }), 0);
}));

test("sequential exact replay returns success and changes stock once", async () => asAdmin(async () => {
  const f = await fixture(); const body = adjustment(f);
  const first = await app.adjustAdminInventory(f.variant.id, body);
  const replay = await app.adjustAdminInventory(f.variant.id, body);
  assert.equal(first.replayed, false); assert.equal(replay.replayed, true); assert.equal(replay.adjustment.id, first.adjustment.id);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity, 13);
  assert.equal(await db.inventoryAdjustment.count({ where: { idempotencyKey: body.idempotencyKey } }), 1);
}));

test("concurrent exact replay changes stock once", async () => asAdmin(async () => {
  const f = await fixture(); const body = adjustment(f);
  const [a, b] = await Promise.all([app.adjustAdminInventory(f.variant.id, body), app.adjustAdminInventory(f.variant.id, body)]);
  assert.deepEqual(new Set([a.replayed, b.replayed]), new Set([false, true]));
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity, 13);
  assert.equal(await db.inventoryAdjustment.count({ where: { idempotencyKey: body.idempotencyKey } }), 1);
}));

test("idempotency identity includes admin, variant, starting quantity, delta, reason and normalized note", async () => asAdmin(async () => {
  const f = await fixture(); const body = adjustment(f, { note: "same note" });
  await app.adjustAdminInventory(f.variant.id, body);
  for (const overrides of [{ delta: 6 }, { reason: "OTHER" }, { note: "different" }, { expectedQuantity: 7 }]) {
    await assert.rejects(app.adjustAdminInventory(f.variant.id, { ...body, ...overrides }), { status: 409 });
  }
  const other = await fixture();
  await assert.rejects(app.adjustAdminInventory(other.variant.id, { ...adjustment(other), idempotencyKey: body.idempotencyKey }), { status: 409 });
  const secondAdmin = await db.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@example.invalid`, role: "ADMIN" } });
  await assert.rejects(as(secondAdmin, () => app.adjustAdminInventory(f.variant.id, body)), { status: 409 });
}));

test("cross-variant unique-key race rolls back the loser and never applies two deltas", async () => asAdmin(async () => {
  const one = await fixture({ quantity: 10 }); const two = await fixture({ quantity: 20 }); const key = randomUUID();
  const results = await Promise.allSettled([
    app.adjustAdminInventory(one.variant.id, adjustment(one, { idempotencyKey: key, delta: 3 })),
    app.adjustAdminInventory(two.variant.id, adjustment(two, { idempotencyKey: key, delta: 4 })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.status === 409).length, 1);
  const quantities = await db.inventory.findMany({ where: { variantId: { in: [one.variant.id, two.variant.id] } }, orderBy: { quantity: "asc" } });
  const movement = quantities.reduce((sum, row) => sum + row.quantity, 0) - 30;
  assert.ok(movement === 3 || movement === 4); assert.equal(await db.inventoryAdjustment.count({ where: { idempotencyKey: key } }), 1);
}));

test("concurrent admin writers serialize and one stale writer conflicts", async () => asAdmin(async () => {
  const f = await fixture({ quantity: 10 });
  const results = await Promise.allSettled([
    app.adjustAdminInventory(f.variant.id, adjustment(f, { delta: 2 })),
    app.adjustAdminInventory(f.variant.id, adjustment(f, { delta: 3 })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.status === 409).length, 1);
  const quantity = (await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity;
  assert.ok(quantity === 12 || quantity === 13); assert.equal(await db.inventoryAdjustment.count({ where: { variantId: f.variant.id } }), 1);
}));

test("history insertion failure rolls back the Inventory update", async () => asAdmin(async () => {
  const f = await fixture({ quantity: 9 }); const body = adjustment(f, { delta: 7 });
  await assert.rejects(as(admin, () => app.adjustAdminInventory(f.variant.id, body), { failHistoryInsert: true }), /TEST ONLY history insert failure/);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity, 9);
  assert.equal(await db.inventoryAdjustment.count({ where: { idempotencyKey: body.idempotencyKey } }), 0);
}));

test("admin identity SetNull preserves history and variant Restrict blocks deletion", async () => {
  const actor = await db.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@example.invalid`, role: "ADMIN" } });
  const f = await fixture(); const result = await as(actor, () => app.adjustAdminInventory(f.variant.id, adjustment(f)));
  await db.user.delete({ where: { id: actor.id } });
  const stored = await db.inventoryAdjustment.findUniqueOrThrow({ where: { id: result.adjustment.id } });
  assert.equal(stored.adminUserId, null); assert.equal(stored.adminEmail, actor.email);
  await assert.rejects(db.productVariant.delete({ where: { id: f.variant.id } }), (error) => error.code === "P2003");
  assert.ok(await db.inventoryAdjustment.findUnique({ where: { id: stored.id } }));
});

test("same-origin JSON checks reject unsafe mutations before stock changes and errors are masked", async () => asAdmin(async () => {
  const f = await fixture(); const body = adjustment(f);
  for (const requestValue of [
    request(`/api/admin/inventory/${f.variant.id}/adjustments`, "POST", body, { Origin: "https://evil.invalid" }),
    new Request(`${origin}/api/admin/inventory/${f.variant.id}/adjustments`, { method: "POST", headers: { Origin: origin, "Content-Type": "text/plain" }, body: JSON.stringify(body) }),
  ]) {
    const response = await app.adjustmentPOST(requestValue, { params: Promise.resolve({ variantId: f.variant.id }) });
    assert.ok([400, 403].includes(response.status)); assert.match(response.headers.get("cache-control"), /no-store/);
  }
  mock.method(console, "error", () => {});
  const failed = await as(admin, () => app.adjustmentPOST(request(`/api/admin/inventory/${f.variant.id}/adjustments`, "POST", body), { params: Promise.resolve({ variantId: f.variant.id }) }), { failHistoryInsert: true });
  assert.equal(failed.status, 500); assert.deepEqual(await failed.json(), { ok: false, message: "Internal server error" });
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity, 8);
}));

test("concurrent checkout and admin adjustment preserve stock without overselling", async () => {
  const buyer = await db.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@example.invalid` } });
  const f = await fixture({ quantity: 10 });
  await db.cart.create({ data: { userId: buyer.id, items: { create: { productId: f.product.id, variantId: f.variant.id, quantity: 2 } } } });
  const results = await Promise.allSettled([
    app.createOrder(buyer.id, { idempotencyKey: randomUUID(), fulfilmentType: "PICKUP", customerName: "Buyer", customerEmail: buyer.email, pickupLocation: "DEIGON" }),
    asAdmin(() => app.adjustAdminInventory(f.variant.id, adjustment(f, { delta: 5 }))),
  ]);
  assert.equal(results[0].status, "fulfilled");
  const quantity = (await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity;
  const adminSucceeded = results[1].status === "fulfilled";
  assert.equal(quantity, adminSucceeded ? 13 : 8);
  if (!adminSucceeded) assert.equal(results[1].reason.status, 409);
  assert.equal(await db.order.count({ where: { userId: buyer.id } }), 1);
  assert.equal(await db.cartItem.count({ where: { cart: { userId: buyer.id } } }), 0);
});

test("concurrent Phase 6E restoration and admin adjustment preserve exact stock", async () => {
  const buyer = await db.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@example.invalid` } });
  const f = await fixture({ quantity: 10 });
  const createdAt = new Date("2026-09-01T00:00:00.000Z");
  const order = await db.order.create({ data: {
    orderNumber: `E-${randomUUID()}`, idempotencyKey: randomUUID(), status: "PENDING", fulfilmentType: "PICKUP",
    subtotal: "499.95", shippingFee: "0", total: "499.95", paymentStatus: "PENDING", customerName: "Buyer",
    customerEmail: buyer.email, pickupLocation: "DEIGON", userId: buyer.id, createdAt,
    items: { create: { quantity: 2, unitPrice: "249.975", lineTotal: "499.95", title: f.product.name, sku: f.variant.sku, productId: f.product.id, variantId: f.variant.id } },
    payment: { create: { amount: "499.95", status: "PENDING", provider: "YOCO" } },
  } });
  const results = await Promise.allSettled([
    app.expireUnpaidOrderCandidate(order.id, new Date("2026-09-02T00:00:00.000Z"), new Date("2026-09-03T00:00:00.000Z")),
    asAdmin(() => app.adjustAdminInventory(f.variant.id, adjustment(f, { delta: 5 }))),
  ]);
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[0].value, "expired");
  const quantity = (await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity;
  const adminSucceeded = results[1].status === "fulfilled";
  assert.equal(quantity, adminSucceeded ? 17 : 12);
  if (!adminSucceeded) assert.equal(results[1].reason.status, 409);
  const lifecycle = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
  assert.equal(lifecycle.status, "CANCELLED"); assert.equal(lifecycle.payment.status, "FAILED"); assert.ok(lifecycle.inventoryReleasedAt);
});
