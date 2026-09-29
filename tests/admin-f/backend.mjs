import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { after, before, mock, test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";
import { database } from "../admin-b1/support/database.mjs";

const context = new AsyncLocalStorage();
const origin = "https://admin-f.example.invalid";
const originalOrigin = process.env.APP_URL;
let handle, db, app, admin, customer, category;

const as = (user, action) => context.run({ user }, action);
const asAdmin = (action) => as(admin, action);

function request(path, method = "GET", body, headers = {}) {
  return new Request(`${origin}${path}`, {
    method,
    headers: body === undefined
      ? { Origin: origin, ...headers }
      : { Origin: origin, "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

function saleInput(updatedAt, overrides = {}) {
  return {
    expectedUpdatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt,
    salePrice: "1200.00",
    saleStartsAt: null,
    saleEndsAt: null,
    ...overrides,
  };
}

async function fixture(overrides = {}) {
  const id = randomUUID();
  const product = await db.product.create({
    data: {
      name: `Admin F product ${id}`,
      slug: `admin-f-${id}`,
      categoryId: category.id,
      variants: {
        create: {
          sku: `ADMIN-F-${id}`,
          size: "M",
          color: "Black",
          price: "1500.00",
          inventory: { create: { quantity: 7 } },
          ...overrides,
        },
      },
    },
    include: { variants: { include: { inventory: true } } },
  });
  return { product, variant: product.variants[0] };
}

const params = (productId, variantId) => ({ params: Promise.resolve({ productId, variantId }) });

async function setProductToken(productId, token) {
  await db.product.update({ where: { id: productId }, data: { updatedAt: token } });
}

async function withClock(at, action) {
  mock.timers.enable({ apis: ["Date"], now: at.getTime() });
  try { return await action(); } finally { mock.timers.reset(); }
}

before(async () => {
  handle = await database();
  db = handle.db;
  admin = await db.user.create({ data: { id: randomUUID(), email: "admin-f@example.invalid", role: "ADMIN" } });
  customer = await db.user.create({ data: { id: randomUUID(), email: "customer-f@example.invalid" } });
  category = await db.category.create({ data: { name: "Admin F category", slug: "admin-f-category" } });
  globalThis.__adminF = { db, context };
  app = await bundle(`
    export { getAdminProductVariantSale } from './lib/admin/products/sale/queries';
    export { updateAdminProductVariantSale } from './lib/admin/products/sale/mutations';
    export { rethrowKnownSaleConstraint } from './lib/admin/products/sale/errors';
    export { updateAdminProductVariant } from './lib/admin/products/mutations';
    export { GET as saleGET, PATCH as salePATCH } from './app/api/admin/products/[productId]/variants/[variantId]/sale/route';
  `, {
    "server-only": "",
    "@/lib/prisma": "export const prisma = globalThis.__adminF.db;",
    "@/lib/supabase/server": `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__adminF.context.getStore()?.user ?? null }, error: null }) } });`,
  });
  process.env.APP_URL = origin;
});

after(async () => {
  if (originalOrigin === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalOrigin;
  delete globalThis.__adminF;
  await handle?.close();
});

test("unauthenticated and customer callers cannot read or mutate sale pricing", async () => {
  const { product, variant } = await fixture();
  for (const user of [null, customer]) {
    const expected = user ? 403 : 401;
    const get = await as(user, () => app.saleGET(request("/sale"), params(product.id, variant.id)));
    const patch = await as(user, () => app.salePATCH(request("/sale", "PATCH", saleInput(product.updatedAt)), params(product.id, variant.id)));
    assert.equal(get.status, expected);
    assert.equal(patch.status, expected);
  }
  const stored = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
  assert.equal(stored.salePrice, null);
});

test("query and mutation services independently enforce admin authorization", async () => {
  const { product, variant } = await fixture();
  for (const user of [null, customer]) {
    await assert.rejects(() => as(user, () => app.getAdminProductVariantSale(product.id, variant.id)), { status: user ? 403 : 401 });
    await assert.rejects(() => as(user, () => app.updateAdminProductVariantSale(product.id, variant.id, saleInput(product.updatedAt))), { status: user ? 403 : 401 });
  }
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).salePrice, null);
});

test("admin GET returns the canonical no-store sale DTO and no internal fields", async () => asAdmin(async () => {
  const { product, variant } = await fixture({ salePrice: "1200.00" });
  const response = await app.saleGET(request("/sale"), params(product.id, variant.id));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  const { data } = await response.json();
  assert.deepEqual(Object.keys(data).sort(), [
    "color", "effectivePrice", "isOnSale", "normalPrice", "productId", "productUpdatedAt",
    "saleEndsAt", "salePrice", "saleStartsAt", "size", "sku", "state", "variantId",
  ].sort());
  assert.deepEqual(data, {
    productId: product.id,
    variantId: variant.id,
    sku: variant.sku,
    size: "M",
    color: "Black",
    normalPrice: "1500.00",
    salePrice: "1200.00",
    saleStartsAt: null,
    saleEndsAt: null,
    effectivePrice: "1200.00",
    isOnSale: true,
    state: "ACTIVE",
    productUpdatedAt: product.updatedAt.toISOString(),
  });
}));

test("GET derives scheduled state at one server instant", async () => asAdmin(async () => {
  const futureStart = new Date(Date.now() + 86_400_000);
  const { product, variant } = await fixture({
    salePrice: "1100.00",
    saleStartsAt: futureStart,
  });
  const data = await app.getAdminProductVariantSale(product.id, variant.id);
  assert.equal(data.state, "SCHEDULED");
  assert.equal(data.isOnSale, false);
  assert.equal(data.effectivePrice, "1500.00");
  assert.equal(data.salePrice, "1100.00");
  assert.equal(data.saleStartsAt, futureStart.toISOString());
}));

test("product/variant ownership mismatches return safe 404 responses", async () => asAdmin(async () => {
  const first = await fixture();
  const second = await fixture();
  for (const [productId, variantId] of [
    [randomUUID(), first.variant.id],
    [first.product.id, randomUUID()],
    [first.product.id, second.variant.id],
  ]) {
    const response = await app.saleGET(request("/sale"), params(productId, variantId));
    assert.equal(response.status, 404);
    assert.doesNotMatch(JSON.stringify(await response.json()), /ADMIN-F|customer-f|postgres/i);
  }
}));

test("PATCH rejects missing, foreign and malformed origins plus non-JSON before writes", async () => asAdmin(async () => {
  const { product, variant } = await fixture();
  const cases = [
    new Request(`${origin}/sale`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saleInput(product.updatedAt)) }),
    request("/sale", "PATCH", saleInput(product.updatedAt), { Origin: "https://evil.invalid" }),
    request("/sale", "PATCH", JSON.stringify(saleInput(product.updatedAt)), { "Content-Type": "text/plain" }),
    request("/sale", "PATCH", "{", { "Content-Type": "application/json" }),
  ];
  for (const candidate of cases) {
    const response = await app.salePATCH(candidate, params(product.id, variant.id));
    assert.ok([400, 403].includes(response.status));
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  }
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).salePrice, null);
}));

test("PATCH accepts JSON media type parameters and persists only sale configuration", async () => asAdmin(async () => {
  const { product, variant } = await fixture();
  const beforeInventory = await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } });
  const response = await app.salePATCH(
    request("/sale", "PATCH", saleInput(product.updatedAt, {
      salePrice: "999.95",
      saleStartsAt: "2026-10-01T02:00:00+02:00",
      saleEndsAt: "2026-11-01T00:00:00Z",
    }), { "Content-Type": "Application/JSON; charset=utf-8" }),
    params(product.id, variant.id),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  const data = (await response.json()).data;
  assert.equal(data.salePrice, "999.95");
  assert.equal(data.saleStartsAt, "2026-10-01T00:00:00.000Z");
  assert.equal(data.saleEndsAt, "2026-11-01T00:00:00.000Z");
  assert.notEqual(data.productUpdatedAt, product.updatedAt.toISOString());
  const stored = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
  assert.equal(stored.price.toFixed(2), "1500.00");
  assert.equal(stored.sku, variant.sku);
  assert.deepEqual(await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }), beforeInventory);
}));

test("sale price equal to or above base is a controlled 409 with no write", async () => asAdmin(async () => {
  for (const salePrice of ["1500.00", "1500.01", "99999999.99"]) {
    const { product, variant } = await fixture();
    const response = await app.salePATCH(request("/sale", "PATCH", saleInput(product.updatedAt, { salePrice })), params(product.id, variant.id));
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /base price.*above.*sale price/i);
    const stored = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    assert.equal(stored.salePrice, null);
  }
}));

test("clearing a sale leaves base price, inventory and order/payment snapshots untouched", async () => asAdmin(async () => {
  const { product, variant } = await fixture({ salePrice: "1200.00", saleStartsAt: new Date("2026-09-01T00:00:00Z") });
  const order = await db.order.create({
    data: {
      orderNumber: `DGN-F-${randomUUID()}`,
      idempotencyKey: randomUUID(),
      fulfilmentType: "PICKUP",
      subtotal: "1500.00",
      shippingFee: "0",
      total: "1500.00",
      customerName: "Snapshot name",
      customerEmail: "snapshot@example.invalid",
      pickupLocation: "Snapshot pickup",
      userId: customer.id,
      items: { create: { productId: product.id, variantId: variant.id, quantity: 1, unitPrice: "1500.00", lineTotal: "1500.00", title: "Snapshot title", sku: "SNAPSHOT-SKU" } },
      payment: { create: { amount: "1500.00", provider: "YOCO" } },
    },
  });
  const before = {
    inventory: await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }),
    order: await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payment: true } }),
  };
  const result = await app.updateAdminProductVariantSale(product.id, variant.id, saleInput(product.updatedAt, { salePrice: null }));
  assert.equal(result.salePrice, null);
  assert.equal(result.saleStartsAt, null);
  assert.equal(result.saleEndsAt, null);
  const stored = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
  assert.equal(stored.price.toFixed(2), "1500.00");
  assert.deepEqual(await db.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }), before.inventory);
  assert.deepEqual(await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payment: true } }), before.order);
}));

test("a fresh no-op advances the shared token while a stale no-op is rejected", async () => asAdmin(async () => {
  const { product, variant } = await fixture({ salePrice: "1200.00" });
  const first = await app.updateAdminProductVariantSale(product.id, variant.id, saleInput(product.updatedAt));
  assert.notEqual(first.productUpdatedAt, product.updatedAt.toISOString());
  await assert.rejects(() => app.updateAdminProductVariantSale(product.id, variant.id, saleInput(product.updatedAt)), { status: 409 });
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).salePrice.toFixed(2), "1200.00");
}));

test("two Admin F writers sharing one token cannot silently overwrite each other", async () => asAdmin(async () => {
  const { product, variant } = await fixture();
  const attempts = await Promise.allSettled([
    app.updateAdminProductVariantSale(product.id, variant.id, saleInput(product.updatedAt, { salePrice: "1100.00" })),
    app.updateAdminProductVariantSale(product.id, variant.id, saleInput(product.updatedAt, { salePrice: "1000.00" })),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = attempts.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.status, 409);
  assert.ok(["1100.00", "1000.00"].includes((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).salePrice.toFixed(2)));
}));

test("Admin F then Admin D rejects the stale shared product token", async () => asAdmin(async () => {
  const { product, variant } = await fixture();
  const token = new Date("2030-02-03T04:05:06.123Z");
  await setProductToken(product.id, token);
  const sale = await withClock(token, () => app.updateAdminProductVariantSale(
    product.id,
    variant.id,
    saleInput(token, { salePrice: "1000.00" }),
  ));
  assert.equal(sale.productUpdatedAt, "2030-02-03T04:05:06.124Z");
  await assert.rejects(() => app.updateAdminProductVariant(product.id, variant.id, {
    expectedUpdatedAt: token.toISOString(), sku: variant.sku, size: variant.size, color: variant.color, price: "1600.00",
  }), { status: 409 });
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).price.toFixed(2), "1500.00");
}));

test("Admin D then Admin F rejects the stale shared product token", async () => asAdmin(async () => {
  const { product, variant } = await fixture();
  const token = new Date("2030-02-03T04:05:06.500Z");
  await setProductToken(product.id, token);
  const updated = await withClock(token, () => app.updateAdminProductVariant(product.id, variant.id, {
    expectedUpdatedAt: token.toISOString(), sku: variant.sku, size: variant.size, color: variant.color, price: "1600.00",
  }));
  assert.equal(updated.updatedAt, "2030-02-03T04:05:06.501Z");
  await assert.rejects(() => app.updateAdminProductVariantSale(product.id, variant.id, saleInput(token, { salePrice: "1000.00" })), { status: 409 });
  const stored = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
  assert.equal(stored.price.toFixed(2), "1600.00");
  assert.equal(stored.salePrice, null);
}));

test("PATCH resolves sale state from wall clock rather than the synthetic version token", async () => asAdmin(async () => {
  const { product, variant } = await fixture();
  const pricingAt = new Date("2030-02-03T04:05:06.500Z");
  await setProductToken(product.id, pricingAt);
  const result = await withClock(pricingAt, () => app.updateAdminProductVariantSale(
    product.id,
    variant.id,
    saleInput(pricingAt, {
      salePrice: "1200.00",
      saleStartsAt: "2030-02-03T04:05:06.501Z",
    }),
  ));
  assert.equal(result.productUpdatedAt, "2030-02-03T04:05:06.501Z");
  assert.equal(result.state, "SCHEDULED");
  assert.equal(result.isOnSale, false);
  assert.equal(result.effectivePrice, "1500.00");
}));

test("Admin D allows base above sale and blocks equal/below without altering sale", async () => asAdmin(async () => {
  {
    const { product, variant } = await fixture({ salePrice: "1200.00" });
    await app.updateAdminProductVariant(product.id, variant.id, {
      expectedUpdatedAt: product.updatedAt.toISOString(), sku: variant.sku, size: variant.size, color: variant.color, price: "1300.00",
    });
    const stored = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    assert.equal(stored.price.toFixed(2), "1300.00");
    assert.equal(stored.salePrice.toFixed(2), "1200.00");
  }
  for (const price of ["1200.00", "1199.99"]) {
    const { product, variant } = await fixture({ salePrice: "1200.00" });
    await assert.rejects(() => app.updateAdminProductVariant(product.id, variant.id, {
      expectedUpdatedAt: product.updatedAt.toISOString(), sku: variant.sku, size: variant.size, color: variant.color, price,
    }), { status: 409 });
    const stored = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    assert.equal(stored.price.toFixed(2), "1500.00");
    assert.equal(stored.salePrice.toFixed(2), "1200.00");
  }
}));

test("specific database sale constraint maps to 409 while unrelated errors remain untouched", async () => asAdmin(async () => {
  const { variant } = await fixture({ salePrice: "1200.00" });
  let constraintError;
  try {
    await db.productVariant.update({ where: { id: variant.id }, data: { price: "1100.00" } });
  } catch (error) {
    constraintError = error;
  }
  assert.ok(constraintError);
  assert.throws(() => app.rethrowKnownSaleConstraint(constraintError), { status: 409 });
  const unrelated = new Error("unrelated-private-error");
  assert.throws(() => app.rethrowKnownSaleConstraint(unrelated), (error) => error === unrelated);
}));

test("unexpected database failures are masked by the route", async () => {
  const broken = await bundle(`export { GET } from './app/api/admin/products/[productId]/variants/[variantId]/sale/route';`, {
    "server-only": "",
    "@/lib/prisma": `export const prisma = {
      user: { findUnique: async () => ({ role: 'ADMIN' }) },
      product: { findUnique: async () => { throw Error('postgres://secret'); } },
    };`,
    "@/lib/supabase/server": `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } }, error: null }) } });`,
  });
  mock.method(console, "error", () => {});
  const response = await broken.GET(request("/sale"), params(randomUUID(), randomUUID()));
  mock.restoreAll();
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.deepEqual(await response.json(), { ok: false, message: "Internal server error" });
});
