import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { bundle } from "../admin-a/support/bundle.mjs";
import { database } from "./support/database.mjs";

const context = new AsyncLocalStorage();
let databaseHandle, db, pool, app, admin, customer;
const originalOrigin = process.env.APP_URL;
const originalNodeEnv = process.env.NODE_ENV;
const origin = "https://admin-b1.example.invalid";
const as = (user, action, hooks = {}) => context.run({ user, ...hooks }, action);
const asAdmin = (action, hooks) => as(admin, action, hooks);
const transition = (id, expectedStatus, targetStatus) => app.transitionAdminOrder(id, { expectedStatus, targetStatus });
const estimate = (id, value, previous = null, status = "CONFIRMED") => app.setAdminOrderEstimate(id, {
  expectedStatus: status, expectedEstimatedDeliveryDate: previous, estimatedDeliveryDate: value,
});
const conflict = (action) => assert.rejects(action, { status: 409 });
const clone = (value) => JSON.parse(JSON.stringify(value));

before(async () => {
  databaseHandle = await database(); ({ db, pool } = databaseHandle);
  admin = await db.user.create({ data: { id: randomUUID(), email: "admin-b1@example.invalid", role: "ADMIN" } });
  customer = await db.user.create({ data: { id: randomUUID(), email: "customer-b1@example.invalid" } });
  const client = db.$extends({ query: {
    order: {
      async findUnique(event) {
        const result = await event.query(event.args);
        const store = context.getStore();
        if (store?.holdOrder && !store.held) { store.held = true; store.holdOrder.enter(); await store.holdOrder.release; }
        return result;
      },
      async update(event) {
        const result = await event.query(event.args);
        if (context.getStore()?.failUpdate) throw new Error("TEST ONLY rollback after write");
        return result;
      },
    },
    payment: { async findUnique(event) {
      const result = await event.query(event.args);
      const store = context.getStore();
      if (store?.holdPayment && !store.held) { store.held = true; store.holdPayment.enter(); await store.holdPayment.release; }
      return result;
    } },
  } });
  globalThis.__adminB1 = { client, context };
  app = await bundle(`
    export * from './lib/admin/orders/mutations';
    export * from './lib/admin/orders/queries';
    export * from './lib/admin/orders/input';
    export * from './lib/payments/process-yoco-webhook';
    export { GET as listGET } from './app/api/admin/orders/route';
    export { GET as detailGET } from './app/api/admin/orders/[orderId]/route';
    export { PATCH as fulfilmentPATCH } from './app/api/admin/orders/[orderId]/fulfilment/route';
    export { PATCH as estimatePATCH } from './app/api/admin/orders/[orderId]/estimated-delivery/route';
  `, {
    "server-only": "",
    "@/lib/prisma": "export const prisma = globalThis.__adminB1.client;",
    "@/lib/supabase/server": `export const createClient = async () => ({ auth: { getUser: async () => {
      const store = globalThis.__adminB1.context.getStore();
      if (store?.authFailure) throw Error('TEST ONLY secret provider detail');
      return { data: { user: store?.user ?? null }, error: null };
    } } });`,
  });
  process.env.APP_URL = origin;
});
after(async () => {
  if (originalOrigin === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalOrigin;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  delete globalThis.__adminB1;
  await databaseHandle?.close();
});

async function fixture(orderData = {}, paymentData = {}) {
  const id = randomUUID();
  const user = await db.user.create({ data: { id, email: `${id}@example.invalid`, name: "Live customer" } });
  const address = await db.address.create({ data: { userId: id, fullName: "Live", addressLine1: "Live address", city: "Live city", province: "Live province", postalCode: "0001" } });
  const category = await db.category.create({ data: { name: "Test category", slug: id } });
  const product = await db.product.create({ data: { name: "Live product", slug: id, categoryId: category.id } });
  const variant = await db.productVariant.create({ data: { productId: product.id, sku: id, price: "100.25", inventory: { create: { quantity: 17 } } } });
  const cart = await db.cart.create({ data: { userId: id, items: { create: { productId: product.id, variantId: variant.id, quantity: 3 } } } });
  const order = await db.order.create({ data: {
    orderNumber: `DGN-B1-${id}`, idempotencyKey: `idem-${id}`, status: "CONFIRMED", paymentStatus: "PAID", fulfilmentType: "DELIVERY",
    subtotal: "200.50", shippingFee: "50.25", total: "250.75", customerName: "Historical Customer", customerEmail: `snapshot-${id}@example.invalid`, customerPhone: "0000000000",
    shippingAddressLine1: "Historical address", shippingAddressLine2: "Historical line two", shippingCity: "Historical city", shippingProvince: "Limpopo", shippingPostalCode: "0000", shippingCountry: "South Africa",
    pickupLocation: null, confirmedAt: new Date("2026-01-01"), userId: id, addressId: address.id,
    items: { create: { quantity: 2, unitPrice: "100.25", lineTotal: "200.50", title: "Historical item", sku: "Historical SKU", size: "M", color: "Black", imageUrl: "https://example.invalid/item.png", productId: product.id, variantId: variant.id } },
    payment: { create: { provider: "YOCO", amount: "250.75", status: "PAID", transactionId: `txn-${id}`, providerCheckoutId: `checkout-${id}`, ...paymentData } },
    ...orderData,
  } });
  return { order, user, address, product, variant, cart };
}
async function snapshot(f) {
  // Includes all columns, particularly Payment.updatedAt and every immutable snapshot.
  return clone({
    order: await db.order.findUnique({ where: { id: f.order.id }, include: { items: true, payment: true } }),
    inventory: await db.inventory.findUnique({ where: { variantId: f.variant.id } }),
    cart: await db.cart.findUnique({ where: { id: f.cart.id }, include: { items: true } }),
  });
}
function unchangedExcept(beforeValue, afterValue, fields) {
  const before = clone(beforeValue), after = clone(afterValue);
  for (const field of fields) { delete before.order[field]; delete after.order[field]; }
  assert.deepEqual(after, before);
}

test("populated migration preserves old rows, constraints, indexes and all unrelated columns", () => assert.equal(databaseHandle.migrationVerified, true));

for (const [type, path] of [["DELIVERY", ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]], ["PICKUP", ["CONFIRMED", "PROCESSING", "READY_FOR_PICKUP", "DELIVERED"]]]) {
  test(`${type}: all milestones, retries and complete payment/inventory/cart/snapshot immutability`, async () => asAdmin(async () => {
    const f = await fixture({ fulfilmentType: type });
    const fields = { PROCESSING: "processingAt", SHIPPED: "shippedAt", READY_FOR_PICKUP: "readyForPickupAt", DELIVERED: "deliveredAt" };
    for (let index = 0; index < path.length - 1; index++) {
      const beforeValue = await snapshot(f);
      const result = await transition(f.order.id, path[index], path[index + 1]);
      assert.equal(result.status, path[index + 1]); assert.ok(result[fields[path[index + 1]]]);
      const afterValue = await snapshot(f);
      unchangedExcept(beforeValue, afterValue, ["status", "updatedAt", fields[path[index + 1]]]);
      assert.deepEqual(await transition(f.order.id, path[index], path[index + 1]), result);
      assert.deepEqual(await snapshot(f), afterValue);
    }
    const terminal = await snapshot(f);
    await conflict(() => transition(f.order.id, "DELIVERED", "PROCESSING"));
    await conflict(() => transition(f.order.id, "CONFIRMED", "PROCESSING"));
    assert.deepEqual(await snapshot(f), terminal);
  }));
}

const inconsistent = [
  ["missing Payment", {}, null],
  ["Payment pending", {}, { status: "PENDING" }],
  ["Payment failed", {}, { status: "FAILED" }],
  ["Payment refunded", {}, { status: "REFUNDED" }],
  ["Order payment pending", { paymentStatus: "PENDING" }],
  ["Order payment failed", { paymentStatus: "FAILED" }],
  ["Order payment refunded", { paymentStatus: "REFUNDED" }],
  ["missing confirmation", { confirmedAt: null }],
  ["cancellation timestamp", { cancelledAt: new Date() }],
  ["inventory released", { inventoryReleasedAt: new Date() }],
  ["amount mismatch", {}, { amount: "250.74" }],
  ["pending status", { status: "PENDING" }],
  ["cancelled status", { status: "CANCELLED" }],
  ["opposite branch status", { status: "READY_FOR_PICKUP" }],
  ["opposite branch milestone", { readyForPickupAt: new Date() }],
  ["future target milestone", { processingAt: new Date() }],
  ["later milestone", { deliveredAt: new Date() }],
  ["future confirmation", { confirmedAt: new Date("2999-01-01") }],
];
for (const [name, orderData, paymentData] of inconsistent) test(`conflict without repair: ${name}`, async () => asAdmin(async () => {
  const f = await fixture(orderData, paymentData ?? {});
  if (paymentData === null) await db.payment.delete({ where: { orderId: f.order.id } });
  const beforeValue = await snapshot(f);
  await conflict(() => transition(f.order.id, "CONFIRMED", "PROCESSING"));
  assert.deepEqual(await snapshot(f), beforeValue);
  // ETA uses the same paid-state checks (future confirmation only affects adding a milestone).
  if (name !== "future confirmation") await conflict(() => estimate(f.order.id, "2999-01-01"));
  assert.deepEqual(await snapshot(f), beforeValue);
}));

test("historical NULL milestones are preserved; retry requires target timestamp", async () => asAdmin(async () => {
  const f = await fixture({ status: "SHIPPED" });
  await conflict(() => transition(f.order.id, "PROCESSING", "SHIPPED"));
  const result = await transition(f.order.id, "SHIPPED", "DELIVERED");
  assert.equal(result.processingAt, null); assert.equal(result.shippedAt, null); assert.ok(result.deliveredAt);
}));
test("milestone chronology is checked without repairing old data", async () => asAdmin(async () => {
  const f = await fixture({ status: "SHIPPED", processingAt: new Date("2026-03-01"), shippedAt: new Date("2026-02-01") });
  const beforeValue = await snapshot(f);
  await conflict(() => transition(f.order.id, "SHIPPED", "DELIVERED"));
  assert.deepEqual(await snapshot(f), beforeValue);
}));

test("ETA today, future, clear and duplicate keep every protected field unchanged", async () => asAdmin(async () => {
  const f = await fixture();
  let previous = null;
  for (const value of [app.johannesburgToday(), "2999-02-28", null]) {
    const beforeValue = await snapshot(f);
    const result = await estimate(f.order.id, value, previous);
    assert.equal(result.estimatedDeliveryDate, value);
    const afterValue = await snapshot(f);
    unchangedExcept(beforeValue, afterValue, ["estimatedDeliveryDate", "updatedAt"]);
    assert.deepEqual(await estimate(f.order.id, value, previous), result);
    assert.deepEqual(await snapshot(f), afterValue);
    previous = value;
  }
}));
for (const status of ["PROCESSING", "SHIPPED"]) test(`ETA editable in ${status}`, async () => asAdmin(async () => {
  const f = await fixture({ status });
  assert.equal((await estimate(f.order.id, "2999-01-01", null, status)).estimatedDeliveryDate, "2999-01-01");
}));
test("ETA rejects past new date but preserves overdue stored date and allows clearing", async () => asAdmin(async () => {
  const f = await fixture({ estimatedDeliveryDate: new Date("2020-01-01") });
  const beforeValue = await snapshot(f);
  assert.equal((await estimate(f.order.id, "2020-01-01", null)).estimatedDeliveryDate, "2020-01-01");
  assert.deepEqual(await snapshot(f), beforeValue);
  await assert.rejects(() => estimate(f.order.id, "2020-01-02", "2020-01-01"), { status: 400 });
  assert.equal((await estimate(f.order.id, null, "2020-01-01")).estimatedDeliveryDate, null);
}));
for (const [name, data] of [["PICKUP", { fulfilmentType: "PICKUP" }], ["DELIVERED", { status: "DELIVERED" }]]) test(`ETA ${name} readonly even on no-op`, async () => asAdmin(async () => {
  const f = await fixture(data); const beforeValue = await snapshot(f);
  await conflict(() => estimate(f.order.id, null, null, f.order.status));
  assert.deepEqual(await snapshot(f), beforeValue);
}));
test("ETA stale status or expected date conflicts", async () => asAdmin(async () => {
  const f = await fixture(); const beforeValue = await snapshot(f);
  await conflict(() => estimate(f.order.id, "2999-01-01", "2999-01-02"));
  await conflict(() => estimate(f.order.id, "2999-01-01", null, "PROCESSING"));
  assert.deepEqual(await snapshot(f), beforeValue);
}));

function gate() {
  let enter, unblock;
  const entered = new Promise((resolve) => { enter = resolve; });
  const release = new Promise((resolve) => { unblock = resolve; });
  return { enter, entered, release, unblock };
}
async function waitForLock() {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const result = await pool.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
    if (result.rowCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected a competing PostgreSQL row-lock wait");
}
async function race(first, second, hold = "holdOrder") {
  const barrier = gate();
  const a = asAdmin(first, { [hold]: barrier });
  const capturedA = a.then((value) => ({ status: "fulfilled", value }), (reason) => ({ status: "rejected", reason }));
  await barrier.entered;
  const b = asAdmin(second);
  const capturedB = b.then((value) => ({ status: "fulfilled", value }), (reason) => ({ status: "rejected", reason }));
  try { await waitForLock(); } finally { barrier.unblock(); }
  return Promise.all([capturedA, capturedB]);
}
test("concurrent duplicate transition serializes and preserves one timestamp", async () => {
  const f = await fixture(); const beforeValue = await snapshot(f);
  const results = await race(() => transition(f.order.id, "CONFIRMED", "PROCESSING"), () => transition(f.order.id, "CONFIRMED", "PROCESSING"));
  assert.ok(results.every((r) => r.status === "fulfilled")); assert.deepEqual(results[0].value, results[1].value);
  unchangedExcept(beforeValue, await snapshot(f), ["status", "processingAt", "updatedAt"]);
});
test("competing admin transition cannot skip a stage", async () => {
  const f = await fixture();
  const results = await race(() => transition(f.order.id, "CONFIRMED", "PROCESSING"), () => transition(f.order.id, "CONFIRMED", "SHIPPED"));
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].reason.status, 409);
  assert.equal((await db.order.findUnique({ where: { id: f.order.id } })).status, "PROCESSING");
});
test("stale retry after another admin advances beyond target conflicts", async () => {
  const f = await fixture({ status: "PROCESSING", processingAt: new Date("2026-02-01") });
  const results = await race(() => transition(f.order.id, "PROCESSING", "SHIPPED"), () => transition(f.order.id, "CONFIRMED", "PROCESSING"));
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].reason.status, 409);
});
for (const duplicate of [false, true]) test(`concurrent ETA ${duplicate ? "duplicate is no-op" : "different value conflicts"}`, async () => {
  const f = await fixture(); const beforeValue = await snapshot(f);
  const results = await race(() => estimate(f.order.id, "2999-01-01"), () => estimate(f.order.id, duplicate ? "2999-01-01" : "2999-01-02"));
  assert.equal(results[0].status, "fulfilled");
  if (duplicate) assert.deepEqual(results[0].value, results[1].value); else assert.equal(results[1].reason.status, 409);
  const afterValue = await snapshot(f); assert.match(afterValue.order.estimatedDeliveryDate, /^2999-01-01/);
  unchangedExcept(beforeValue, afterValue, ["estimatedDeliveryDate", "updatedAt"]);
});
for (const kind of ["fulfilment", "estimate"]) test(`${kind} rolls back failure after actual SQL update`, async () => {
  const f = await fixture(); const beforeValue = await snapshot(f);
  await assert.rejects(() => asAdmin(() => kind === "fulfilment" ? transition(f.order.id, "CONFIRMED", "PROCESSING") : estimate(f.order.id, "2999-01-01"), { failUpdate: true }), /rollback after write/);
  assert.deepEqual(await snapshot(f), beforeValue);
});

const event = (f) => ({ id: `evt-${f.user.id}`, type: "payment.succeeded", payload: {
  id: `txn-${f.user.id}`, type: "payment", status: "succeeded", amount: 25075, currency: "ZAR", metadata: { checkoutId: `checkout-${f.user.id}` },
} });
test("admin holds Order while duplicate webhook waits: no Payment lock inversion", async () => {
  const f = await fixture(); const beforeValue = await snapshot(f);
  const results = await race(() => transition(f.order.id, "CONFIRMED", "PROCESSING"), () => app.processYocoWebhook(event(f)));
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].value, "duplicate");
  unchangedExcept(beforeValue, await snapshot(f), ["status", "processingAt", "updatedAt"]);
});
test("webhook commits payment before waiting admin rechecks eligibility", async () => {
  const f = await fixture({ status: "PENDING", paymentStatus: "PENDING", confirmedAt: null }, { status: "PENDING", transactionId: null });
  const beforeValue = await snapshot(f);
  const results = await race(() => app.processYocoWebhook(event(f)), () => transition(f.order.id, "CONFIRMED", "PROCESSING"), "holdPayment");
  assert.equal(results[0].value, "processed"); assert.equal(results[1].value.status, "PROCESSING");
  const afterValue = await snapshot(f);
  assert.equal(afterValue.order.payment.status, "PAID"); assert.equal(afterValue.order.payment.transactionId, `txn-${f.user.id}`);
  unchangedExcept(beforeValue, afterValue, ["status", "paymentStatus", "confirmedAt", "processingAt", "updatedAt", "payment"]);
  // Subsequent admin action alone changes no webhook-authored payment fields.
  await asAdmin(() => transition(f.order.id, "PROCESSING", "SHIPPED"));
  unchangedExcept(afterValue, await snapshot(f), ["status", "shippedAt", "updatedAt"]);
});
test("pending admin attempt cannot mark paid while webhook waits", async () => {
  const f = await fixture({ status: "PENDING", paymentStatus: "PENDING", confirmedAt: null }, { status: "PENDING", transactionId: null });
  const results = await race(() => transition(f.order.id, "CONFIRMED", "PROCESSING"), () => app.processYocoWebhook(event(f)));
  assert.equal(results[0].reason.status, 409); assert.equal(results[1].value, "processed");
  const order = await db.order.findUnique({ where: { id: f.order.id } });
  assert.equal(order.status, "CONFIRMED"); assert.equal(order.processingAt, null);
});

test("detail returns historical snapshots even after changing and deleting live relations", async () => asAdmin(async () => {
  const f = await fixture();
  const beforeValue = await app.getAdminOrder(f.order.id);
  assert.equal(beforeValue.total, "250.75"); assert.equal(beforeValue.subtotal, "200.50"); assert.equal(beforeValue.shippingFee, "50.25");
  assert.deepEqual(beforeValue.payment, { provider: "YOCO", amount: "250.75", status: "PAID" });
  assert.equal(beforeValue.items[0].unitPrice, "100.25"); assert.equal(beforeValue.items[0].lineTotal, "200.50");
  const keys = JSON.stringify(beforeValue);
  for (const key of ["providerCheckoutId", "transactionId", "idempotencyKey", "userId", "addressId", "productId", "variantId", "inventoryReleasedAt"]) assert.ok(!keys.includes(`"${key}"`));
  await db.user.update({ where: { id: f.user.id }, data: { name: "Changed user", email: `${randomUUID()}@example.invalid` } });
  await db.product.update({ where: { id: f.product.id }, data: { name: "Changed product" } });
  await db.productVariant.update({ where: { id: f.variant.id }, data: { sku: randomUUID(), price: "999.99" } });
  await db.address.update({ where: { id: f.address.id }, data: { city: "Changed city" } });
  assert.deepEqual(await app.getAdminOrder(f.order.id), beforeValue);
  await db.cartItem.deleteMany({ where: { cartId: f.cart.id } });
  await db.product.delete({ where: { id: f.product.id } });
  await db.address.delete({ where: { id: f.address.id } });
  assert.deepEqual(await app.getAdminOrder(f.order.id), beforeValue);
}));

test("list search, filters, stable cursor pages, cents and explicit field boundary", async () => asAdmin(async () => {
  const tag = randomUUID();
  const createdAt = new Date("2025-01-01");
  const fixtures = [];
  for (let index = 0; index < 5; index++) fixtures.push(await fixture({ customerName: `Search ${tag}`, createdAt }));
  await fixture({ customerName: `Search ${tag}`, fulfilmentType: "PICKUP", createdAt });
  await fixture({ customerName: `Search ${tag}`, status: "PENDING", paymentStatus: "PENDING", createdAt });
  const params = { search: ` SEARCH ${tag.toUpperCase()} `, status: "CONFIRMED", fulfilmentType: "DELIVERY", paymentStatus: "PAID", limit: "2" };
  const ids = []; let cursor;
  do {
    const result = await app.listAdminOrders(new URLSearchParams({ ...params, ...(cursor ? { cursor } : {}) }));
    for (const row of result.orders) {
      ids.push(row.id); assert.equal(row.total, "250.75");
      assert.deepEqual(Object.keys(row).sort(), ["id", "orderNumber", "customerName", "customerEmail", "createdAt", "total", "paymentStatus", "fulfilmentType", "status"].sort());
    }
    cursor = result.nextCursor;
  } while (cursor);
  assert.deepEqual(ids, fixtures.map((f) => f.order.id).sort().reverse());
  for (const search of [fixtures[0].order.orderNumber.toLowerCase(), fixtures[0].order.customerEmail.toUpperCase()]) {
    assert.equal((await app.listAdminOrders(new URLSearchParams({ search }))).orders[0].id, fixtures[0].order.id);
  }
  const page = await app.listAdminOrders(new URLSearchParams(params));
  await assert.rejects(() => app.listAdminOrders(new URLSearchParams({ ...params, status: "SHIPPED", cursor: page.nextCursor })), { status: 400 });
  const defaultPage = await app.listAdminOrders(new URLSearchParams()); assert.equal(defaultPage.orders.length, 25);
  assert.ok((await app.listAdminOrders(new URLSearchParams("limit=50"))).orders.length <= 50);
}));

test("search treats percent, underscore and backslash literally", async () => asAdmin(async () => {
  const tag = randomUUID();
  const f = await fixture({ customerName: `${tag} 50%_\\literal` });
  await fixture({ customerName: `${tag} 50ABCDEliteral` });
  const result = await app.listAdminOrders(new URLSearchParams({ search: `${tag} 50%_\\literal` }));
  assert.deepEqual(result.orders.map((row) => row.id), [f.order.id]);
}));

test("pagination orders unequal timestamps and works after its anchor is deleted", async () => asAdmin(async () => {
  const tag = randomUUID();
  const older = await fixture({ customerName: tag, createdAt: new Date("2025-01-01") });
  const newer = await fixture({ customerName: tag, createdAt: new Date("2025-01-02") });
  const page = await app.listAdminOrders(new URLSearchParams({ search: tag, limit: "1" }));
  assert.equal(page.orders[0].id, newer.order.id);
  await db.order.delete({ where: { id: newer.order.id } });
  const next = await app.listAdminOrders(new URLSearchParams({ search: tag, limit: "1", cursor: page.nextCursor }));
  assert.equal(next.orders[0].id, older.order.id); assert.equal(next.nextCursor, null);
}));

test("detail has an exact DTO allowlist and safely reads a missing Payment", async () => asAdmin(async () => {
  const f = await fixture();
  await db.payment.delete({ where: { orderId: f.order.id } });
  const result = await app.getAdminOrder(f.order.id);
  assert.equal(result.payment, null);
  assert.deepEqual(Object.keys(result).sort(), [
    "id", "orderNumber", "customerName", "customerEmail", "createdAt", "total", "paymentStatus", "fulfilmentType", "status",
    "confirmedAt", "processingAt", "shippedAt", "readyForPickupAt", "deliveredAt", "estimatedDeliveryDate", "cancelledAt", "cancelReason",
    "customerPhone", "shippingAddressLine1", "shippingAddressLine2", "shippingCity", "shippingProvince", "shippingPostalCode", "shippingCountry",
    "pickupLocation", "subtotal", "shippingFee", "items", "payment",
  ].sort());
}));

function request(method, body, headers = {}, url = `${origin}/api/admin/orders`) {
  return new Request(url, { method, headers: { origin, "content-type": "application/json", ...headers }, ...(method === "PATCH" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
}
const routeContext = (id) => ({ params: Promise.resolve({ orderId: id }) });
function privateResponse(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
}
for (const [route, method] of [["listGET", "GET"], ["detailGET", "GET"], ["fulfilmentPATCH", "PATCH"], ["estimatePATCH", "PATCH"]]) {
  for (const identity of ["anonymous", "customer", "forged-metadata", "admin"]) test(`${route} independent auth: ${identity}`, async () => {
    const f = await fixture(); const beforeValue = await snapshot(f);
    const user = identity === "anonymous" ? null : identity === "admin" ? admin : identity === "forged-metadata" ? { ...customer, user_metadata: { role: "ADMIN" }, app_metadata: { role: "ADMIN" } } : customer;
    const body = route === "estimatePATCH" ? { expectedStatus: "CONFIRMED", expectedEstimatedDeliveryDate: null, estimatedDeliveryDate: "2999-01-01" } : { expectedStatus: "CONFIRMED", targetStatus: "PROCESSING" };
    const response = await as(user, () => app[route](request(method, body, { "x-role": "ADMIN", cookie: "role=ADMIN; adminId=forged" }), routeContext(f.order.id)));
    privateResponse(response, identity === "anonymous" ? 401 : identity === "admin" ? 200 : 403);
    if (identity !== "admin") assert.deepEqual(await snapshot(f), beforeValue);
  });
}
test("reusable server services deny anonymous and CUSTOMER directly before transactions", async () => {
  for (const user of [null, customer]) for (const action of [
    () => app.getAdminOrder("unknown-order-id"), () => app.listAdminOrders(new URLSearchParams()),
    () => transition("unknown-order-id", "CONFIRMED", "PROCESSING"), () => estimate("unknown-order-id", null),
  ]) await assert.rejects(() => as(user, action), { status: user ? 403 : 401 });
});
for (const route of ["fulfilmentPATCH", "estimatePATCH"]) test(`${route}: origin, JSON, forged fields and generic errors`, async () => asAdmin(async () => {
  const f = await fixture(); const beforeValue = await snapshot(f);
  const body = route === "fulfilmentPATCH" ? { expectedStatus: "CONFIRMED", targetStatus: "PROCESSING" } : { expectedStatus: "CONFIRMED", expectedEstimatedDeliveryDate: null, estimatedDeliveryDate: "2999-01-01" };
  for (const invalidOrigin of ["https://attacker.invalid", "null", "", `${origin}.attacker.invalid`, `${origin}/path`]) {
    privateResponse(await app[route](request("PATCH", body, { origin: invalidOrigin }), routeContext(f.order.id)), 403);
  }
  const missing = request("PATCH", body); missing.headers.delete("origin");
  privateResponse(await app[route](missing, routeContext(f.order.id)), 403);
  for (const contentType of ["text/plain", "", "application/x-www-form-urlencoded"]) privateResponse(await app[route](request("PATCH", body, { "content-type": contentType }), routeContext(f.order.id)), 400);
  for (const value of ["{bad", "", null, [], { ...body, paymentStatus: "PAID" }, { ...body, Payment: { status: "PAID" } }, { ...body, role: "ADMIN" }]) {
    privateResponse(await app[route](request("PATCH", value), routeContext(f.order.id)), 400);
  }
  assert.deepEqual(await snapshot(f), beforeValue);
  const response = await asAdmin(() => app[route](request("PATCH", body), routeContext(f.order.id)), { failUpdate: true });
  privateResponse(response, 500); assert.equal((await response.json()).message, "Internal server error");
  assert.deepEqual(await snapshot(f), beforeValue);
}));
test("missing order 404, malformed id/query 400 and conflicts 409 are private", async () => asAdmin(async () => {
  privateResponse(await app.detailGET(request("GET"), routeContext("unknown-order-id")), 404);
  privateResponse(await app.detailGET(request("GET"), routeContext("bad")), 400);
  privateResponse(await app.listGET(request("GET", null, {}, `${origin}/api/admin/orders?limit=51`)), 400);
  privateResponse(await app.fulfilmentPATCH(request("PATCH", { expectedStatus: "CONFIRMED", targetStatus: "PROCESSING" }), routeContext("unknown-order-id")), 404);
  const f = await fixture();
  privateResponse(await app.fulfilmentPATCH(request("PATCH", { expectedStatus: "CONFIRMED", targetStatus: "DELIVERED" }), routeContext(f.order.id)), 409);
}));
test("unexpected auth provider failure returns generic private 500 on reads", async () => {
  for (const route of ["listGET", "detailGET"]) {
    const result = await asAdmin(() => app[route](request("GET"), routeContext("unknown-order-id")), { authFailure: true });
    privateResponse(result, 500); assert.equal((await result.json()).message, "Internal server error");
  }
});
test("origin configuration permits explicit local development but fails closed in production", async () => asAdmin(async () => {
  const f = await fixture();
  const body = { expectedStatus: "CONFIRMED", targetStatus: "PROCESSING" };
  try {
    process.env.NODE_ENV = "development"; process.env.APP_URL = "http://localhost:3000";
    privateResponse(await app.fulfilmentPATCH(request("PATCH", body, { origin: "http://localhost:3000" }), routeContext(f.order.id)), 200);
    process.env.NODE_ENV = "production";
    privateResponse(await app.fulfilmentPATCH(request("PATCH", body, { origin: "http://localhost:3000" }), routeContext(f.order.id)), 500);
    for (const invalid of ["https://user:pass@example.invalid", "https://example.invalid/path", "bad", "https://example.invalid?x=1", ""]) {
      process.env.APP_URL = invalid;
      privateResponse(await app.fulfilmentPATCH(request("PATCH", body), routeContext(f.order.id)), 500);
    }
  } finally {
    process.env.APP_URL = origin;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  }
}));
