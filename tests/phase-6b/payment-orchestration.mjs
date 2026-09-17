// Run: node --test tests/phase-6b/payment-orchestration.mjs
// Fresh loopback PostgreSQL only. Provider boundary mocked; no live Yoco calls.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import Module from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, before, test } from "node:test";
import { build } from "esbuild";
import pg from "pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bin = process.env.DEIGON_TEST_PG_BIN || path.join(root, "node_modules/.cache/phase-5-postgres/package/native/bin");
const executable = (name) => path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const context = new AsyncLocalStorage();
const originalOrigin = process.env.NEXT_PUBLIC_SITE_URL;
const originalAppUrl = process.env.APP_URL;
let db, observer, app, dataDir, started = false;
let originalStock = [];
const failureMessage = "We couldn't start the payment session. Please try again.";

function command(file, args) {
  return execFileSync(file, args, {
    cwd: root, encoding: "utf8", windowsHide: true,
    stdio: path.basename(file).startsWith("pg_ctl") ? "ignore" : "pipe",
  });
}

before(async () => {
  const cache = path.join(root, "node_modules/.cache/phase-6b-tests");
  mkdirSync(cache, { recursive: true });
  const runDir = mkdtempSync(path.join(cache, "run-"));
  dataDir = path.join(runDir, "data");
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const connection = { host: "127.0.0.1", port, user: "phase6b", database: "postgres", ssl: false };
  command(executable("initdb"), ["-D", dataDir, "-U", "phase6b", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  command(executable("pg_ctl"), ["-D", dataDir, "-l", path.join(runDir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  observer = new pg.Pool(connection);
  const ddl = command(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"]);
  assert.ok(!/^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im.test(ddl));
  await observer.query(ddl.slice(ddl.indexOf("-- Create")));
  db = new PrismaClient({ adapter: new PrismaPg(connection) });
  const instrumented = db.$extends({ query: { payment: { async updateMany(event) {
    const stage = context.getStore()?.persistenceFailure;
    if (stage === "before") throw new Error("PRIVATE persistence failure");
    const result = await event.query(event.args);
    if (stage === "after") throw new Error("PRIVATE acknowledgement lost");
    return result;
  } } } });
  globalThis.__deigonPhase6b = { client: instrumented, context };
  const bundle = await build({
    stdin: {
      contents: `export { POST } from './app/api/checkout/route';
        export { createOrder } from './lib/checkout/service';
        export * from './lib/payments/prepare-order-payment';`,
      resolveDir: root, sourcefile: "phase-6b-entry.ts", loader: "ts",
    },
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "phase6b-boundaries", setup(builder) {
      builder.onResolve({ filter: /^(server-only|@\/lib\/(prisma|auth\/require-user|payments\/yoco))$/ }, ({ path }) => ({ path, namespace: "test-boundary" }));
      builder.onLoad({ filter: /.*/, namespace: "test-boundary" }, ({ path }) => ({
        contents: path === "server-only" ? "" : path.endsWith("/prisma")
          ? "export const prisma = globalThis.__deigonPhase6b.client;"
          : path.endsWith("/yoco")
            ? "export const createYocoCheckout = input => globalThis.__deigonPhase6b.context.getStore().provider(input);"
            : `export class AuthError extends Error { constructor(message, status) { super(message); this.status = status; } }
              export async function requireUser() {
                const user = globalThis.__deigonPhase6b.context.getStore()?.user;
                if (!user) throw new AuthError('Authentication required', 401);
                return user;
              }`,
      }));
    } }],
  });
  const loaded = new Module(path.join(root, "phase-6b-test-bundle.cjs"));
  loaded.filename = path.join(root, "phase-6b-test-bundle.cjs");
  loaded.paths = Module._nodeModulePaths(root);
  loaded._compile(bundle.outputFiles[0].text, loaded.filename);
  app = loaded.exports;
  process.env.APP_URL = "https://shop.example";
  delete process.env.NEXT_PUBLIC_SITE_URL;
  console.log(`Isolated PostgreSQL: 127.0.0.1:${port}; ${dataDir}`);
});

afterEach(async () => {
  for (const { id, ...data } of originalStock) {
    await db.inventory.update({ where: { id }, data });
    assert.equal((await db.inventory.findUniqueOrThrow({ where: { id } })).quantity, data.quantity);
  }
  originalStock = [];
  process.env.APP_URL = "https://shop.example";
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

after(async () => {
  try { if (db) await db.$disconnect(); }
  finally {
    try { if (observer) await observer.end(); }
    finally {
      if (started) command(executable("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"]);
      if (originalOrigin === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = originalOrigin;
      if (originalAppUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = originalAppUrl;
      delete globalThis.__deigonPhase6b;
    }
  }
});

async function fixture() {
  const id = randomUUID();
  const user = await db.user.create({ data: { id, email: `${id}@example.invalid` } });
  const category = await db.category.create({ data: { name: "Phase 6B TEST", slug: id } });
  const product = await db.product.create({ data: { name: "Phase 6B TEST", slug: id, categoryId: category.id } });
  const variant = await db.productVariant.create({ data: {
    sku: id, price: "400.50", productId: product.id, inventory: { create: { quantity: 10 } },
  }, include: { inventory: true } });
  originalStock.push({ id: variant.inventory.id, quantity: variant.inventory.quantity, updatedAt: variant.inventory.updatedAt });
  const cart = await db.cart.create({ data: { userId: user.id, items: { create: { productId: product.id, variantId: variant.id, quantity: 1 } } } });
  const body = {
    idempotencyKey: randomUUID(), fulfilmentType: "DELIVERY", customerName: "Test Customer",
    customerEmail: user.email, shippingAddressLine1: "TEST address", shippingCity: "TEST city",
    shippingProvince: "Limpopo", shippingPostalCode: "0000", shippingCountry: "South Africa",
    total: "1.00", amount: "1.00", paymentStatus: "PAID", status: "CONFIRMED",
    successUrl: "https://untrusted.example", userId: "untrusted",
  };
  return { user, cart, variant, body };
}

function providerSpy(overrides) {
  const calls = [];
  const provider = async (input) => {
    calls.push(input);
    const order = await db.order.findUniqueOrThrow({ where: { id: input.externalId }, include: { payment: true } });
    assert.ok(order.payment, "Payment must already be committed and visible on another connection");
    assert.ok(input.amount instanceof Prisma.Decimal);
    assert.ok(input.amount.equals(order.total));
    // NOWAIT proves cart/order locks are released while the external call runs.
    await observer.query('SELECT "id" FROM "Cart" WHERE "userId" = $1 FOR UPDATE NOWAIT', [order.userId]);
    await observer.query('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE NOWAIT', [order.id]);
    assert.equal(input.idempotencyKey, `deigon-yoco-${order.id}`);
    assert.deepEqual(input.metadata, { orderNumber: order.orderNumber });
    if (overrides) return overrides(input);
    return { checkoutId: `checkout_${order.id}`, redirectUrl: `https://c.yoco.com/${order.id}` };
  };
  return { provider, calls };
}

async function post(f, provider, extras = {}) {
  return context.run({ user: f.user, provider, ...extras }, async () => {
    const response = await app.POST(new Request("https://untrusted.example/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-host": "untrusted.example" },
      body: JSON.stringify(f.body),
    }));
    return { status: response.status, body: await response.json() };
  });
}

async function state(f) {
  const orders = await db.order.findMany({ where: { userId: f.user.id }, include: { payment: true } });
  assert.equal(orders.length, 1);
  assert.equal(await db.payment.count({ where: { orderId: orders[0].id } }), 1);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity, 9);
  assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 0);
  const order = orders[0];
  assert.equal(order.status, "PENDING");
  assert.equal(order.paymentStatus, "PENDING");
  assert.equal(order.confirmedAt, null);
  assert.equal(order.payment.status, "PENDING");
  assert.equal(order.payment.transactionId, null);
  return order;
}

function expectFailure(result) {
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { ok: false, message: failureMessage });
}

test("new checkout commits once before Yoco, uses authoritative totals and returns only the payment redirect", async () => {
  const f = await fixture();
  const spy = providerSpy();
  const result = await post(f, spy.provider);
  assert.equal(result.status, 201);
  const order = await state(f);
  assert.equal(order.payment.providerCheckoutId, `checkout_${order.id}`);
  assert.equal(spy.calls[0].amount.toFixed(2), "480.50");
  assert.equal(spy.calls[0].successUrl, "https://shop.example/checkout/payment/success");
  assert.equal(spy.calls[0].cancelUrl, "https://shop.example/checkout/payment/cancel");
  assert.equal(spy.calls[0].failureUrl, "https://shop.example/checkout/payment/failure");
  assert.deepEqual(result.body.payment, { provider: "YOCO", redirectUrl: `https://c.yoco.com/${order.id}` });
  assert.equal(result.body.order.total, "480.50");
  assert.deepEqual(Object.keys(result.body).sort(), ["ok", "order", "payment"]);
});

test("provider failure preserves committed pending records; same application key recovers the same order", async () => {
  const f = await fixture();
  const failed = providerSpy(() => { throw new Error("PRIVATE provider error and credentials"); });
  expectFailure(await post(f, failed.provider));
  const before = await state(f);
  assert.equal(before.payment.providerCheckoutId, null);
  const recovered = providerSpy();
  const result = await post(f, recovered.provider);
  assert.equal(result.status, 201);
  assert.equal(result.body.order.id, before.id);
  assert.equal(failed.calls[0].idempotencyKey, recovered.calls[0].idempotencyKey);
  assert.equal((await state(f)).payment.providerCheckoutId, `checkout_${before.id}`);
});

for (const stage of ["before", "after"]) {
  test(`persistence failure ${stage} write recovers with the same provider key and no extra reservation`, async () => {
    const f = await fixture();
    const spy = providerSpy();
    expectFailure(await post(f, spy.provider, { persistenceFailure: stage }));
    const order = await state(f);
    assert.equal(order.payment.providerCheckoutId, stage === "before" ? null : `checkout_${order.id}`);
    assert.equal((await post(f, spy.provider)).status, 201);
    assert.equal((await state(f)).id, order.id);
    assert.equal(spy.calls.length, 2);
    assert.deepEqual(spy.calls[1], spy.calls[0]);
  });
}

test("concurrent same-key route requests share one order, payment and hosted checkout ID", async () => {
  const f = await fixture();
  const spy = providerSpy();
  const results = await Promise.all(Array.from({ length: 4 }, () => post(f, spy.provider)));
  assert.ok(results.every((result) => result.status === 201));
  assert.equal(new Set(results.map((result) => result.body.order.id)).size, 1);
  assert.equal(new Set(spy.calls.map((call) => call.idempotencyKey)).size, 1);
  const order = await state(f);
  assert.equal(order.payment.providerCheckoutId, `checkout_${order.id}`);
});

test("racing different provider IDs cannot overwrite each other", async () => {
  const f = await fixture();
  let arrived = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const spy = providerSpy(async () => {
    const index = ++arrived;
    if (arrived === 2) release();
    await gate;
    return { checkoutId: `conflict_${index}`, redirectUrl: `https://c.yoco.com/conflict_${index}` };
  });
  const results = await Promise.all([post(f, spy.provider), post(f, spy.provider)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 503]);
  expectFailure(results.find((result) => result.status === 503));
  const saved = (await state(f)).payment.providerCheckoutId;
  assert.equal(results.find((result) => result.status === 201).body.payment.redirectUrl, `https://c.yoco.com/${saved}`);
  const wrong = providerSpy(() => ({ checkoutId: "different_id", redirectUrl: "https://c.yoco.com/different" }));
  expectFailure(await post(f, wrong.provider));
  assert.equal((await state(f)).payment.providerCheckoutId, saved);
});

test("a checkout ID already assigned to another payment fails without leaking database details", async () => {
  const first = await fixture(), second = await fixture();
  const spy = providerSpy(() => ({ checkoutId: "duplicate_test_id", redirectUrl: "https://c.yoco.com/duplicate" }));
  assert.equal((await post(first, spy.provider)).status, 201);
  expectFailure(await post(second, spy.provider));
  assert.equal((await state(first)).payment.providerCheckoutId, "duplicate_test_id");
  assert.equal((await state(second)).payment.providerCheckoutId, null);
});

test("canonical origin is required and validated before creating any order", async () => {
  const f = await fixture();
  const spy = providerSpy();
  for (const value of [undefined, "", "not-a-url", "http://untrusted.example", "https://user:pass@shop.example", "https://shop.example/path", "https://shop.example/?query=1", "https://shop.example/#hash"]) {
    if (value === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = value;
    expectFailure(await post(f, spy.provider));
  }
  assert.equal(spy.calls.length, 0);
  assert.equal(await db.order.count({ where: { userId: f.user.id } }), 0);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity, 10);
  const originalMode = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    process.env.APP_URL = "http://localhost:3000";
    assert.equal(app.getPaymentReturnUrls().successUrl, "http://localhost:3000/checkout/payment/success");
    process.env.NODE_ENV = "production";
    assert.throws(() => app.getPaymentReturnUrls(), app.PaymentPreparationError);
  } finally {
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
  }
  delete process.env.APP_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://fallback.example";
  assert.equal(app.getPaymentReturnUrls().successUrl, "https://fallback.example/checkout/payment/success");
  process.env.APP_URL = "https://preferred.example";
  assert.equal(app.getPaymentReturnUrls().successUrl, "https://preferred.example/checkout/payment/success");
});

test("unauthenticated and cross-user replays cannot prepare another user's payment", async () => {
  const f = await fixture(), other = await fixture();
  const spy = providerSpy();
  assert.equal((await post({ ...f, user: null }, spy.provider)).status, 401);
  assert.equal((await post(f, spy.provider)).status, 201);
  assert.equal((await post({ ...other, body: f.body }, spy.provider)).status, 409);
  assert.equal(spy.calls.length, 1);
});
