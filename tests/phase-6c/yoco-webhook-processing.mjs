// Run: node --test tests/phase-6c/yoco-webhook-processing.mjs
// Fresh loopback PostgreSQL only. No production connection or live Yoco call.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import Module from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, afterEach, before, test } from "node:test";
import { build } from "esbuild";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bin = process.env.DEIGON_TEST_PG_BIN || path.join(root, "node_modules/.cache/phase-5-postgres/package/native/bin");
const executable = (name) => path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const context = new AsyncLocalStorage();
const originalSecret = process.env.YOCO_WEBHOOK_SECRET;
const secretBytes = Buffer.from("phase-6c-processing-fake-secret");
const webhookSecret = `whsec_${secretBytes.toString("base64")}`;
let db, observer, app, dataDir, started = false;
let originalInventory = [];

function command(file, args) {
  return execFileSync(file, args, {
    cwd: root, encoding: "utf8", windowsHide: true,
    stdio: path.basename(file).startsWith("pg_ctl") ? "ignore" : "pipe",
  });
}

before(async () => {
  const cache = path.join(root, "node_modules/.cache/phase-6c-tests");
  mkdirSync(cache, { recursive: true });
  const runDir = mkdtempSync(path.join(cache, "run-"));
  dataDir = path.join(runDir, "data");
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const connection = { host: "127.0.0.1", port, user: "phase6c", database: "postgres", ssl: false };
  command(executable("initdb"), ["-D", dataDir, "-U", "phase6c", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  command(executable("pg_ctl"), ["-D", dataDir, "-l", path.join(runDir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  observer = new pg.Pool(connection);
  const ddl = command(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"]);
  assert.ok(!/^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im.test(ddl));
  await observer.query(ddl.slice(ddl.indexOf("-- Create")));
  db = new PrismaClient({ adapter: new PrismaPg(connection) });
  const instrumented = db.$extends({ query: { payment: { async update(event) {
    const fail = context.getStore()?.failPaymentUpdate;
    if (fail === "before") throw new Error("PRIVATE simulated database failure");
    const result = await event.query(event.args);
    if (fail === "after") throw new Error("PRIVATE simulated acknowledgement failure");
    return result;
  } } } });
  globalThis.__deigonPhase6c = { client: instrumented };
  const bundle = await build({
    stdin: {
      contents: `export { POST } from './app/api/webhooks/yoco/route';
        export * from './lib/payments/process-yoco-webhook';`,
      resolveDir: root, sourcefile: "phase-6c-entry.ts", loader: "ts",
    },
    bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "phase6c-boundaries", setup(builder) {
      builder.onResolve({ filter: /^(server-only|@\/lib\/prisma)$/ }, ({ path }) => ({ path, namespace: "test-boundary" }));
      builder.onLoad({ filter: /.*/, namespace: "test-boundary" }, ({ path }) => ({
        contents: path === "server-only" ? "" : "export const prisma = globalThis.__deigonPhase6c.client;",
      }));
    } }],
  });
  const loaded = new Module(path.join(root, "phase-6c-test-bundle.cjs"));
  loaded.filename = path.join(root, "phase-6c-test-bundle.cjs");
  loaded.paths = Module._nodeModulePaths(root);
  loaded._compile(bundle.outputFiles[0].text, loaded.filename);
  app = loaded.exports;
  process.env.YOCO_WEBHOOK_SECRET = webhookSecret;
  console.log(`Isolated PostgreSQL: 127.0.0.1:${port}; ${dataDir}`);
});

afterEach(async () => {
  process.env.YOCO_WEBHOOK_SECRET = webhookSecret;
  for (const original of originalInventory) {
    await db.inventory.update({
      where: { id: original.id },
      data: { quantity: original.quantity, updatedAt: original.updatedAt },
    });
    assert.equal((await db.inventory.findUniqueOrThrow({ where: { id: original.id } })).quantity, original.quantity);
  }
  originalInventory = [];
});

after(async () => {
  try { if (db) await db.$disconnect(); }
  finally {
    try { if (observer) await observer.end(); }
    finally {
      if (started) command(executable("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"]);
      if (originalSecret === undefined) delete process.env.YOCO_WEBHOOK_SECRET;
      else process.env.YOCO_WEBHOOK_SECRET = originalSecret;
      delete globalThis.__deigonPhase6c;
    }
  }
});

async function fixture(overrides = {}) {
  const id = randomUUID();
  const user = await db.user.create({ data: { id, email: `${id}@example.invalid` } });
  const category = await db.category.create({ data: { name: "Phase 6C TEST", slug: id } });
  const product = await db.product.create({ data: { name: "Phase 6C TEST", slug: id, categoryId: category.id } });
  const variant = await db.productVariant.create({ data: {
    sku: id, price: "480.50", productId: product.id,
    inventory: { create: { quantity: 7 } },
  }, include: { inventory: true } });
  originalInventory.push({ id: variant.inventory.id, quantity: variant.inventory.quantity, updatedAt: variant.inventory.updatedAt });
  const cart = await db.cart.create({ data: {
    userId: user.id,
    items: { create: { productId: product.id, variantId: variant.id, quantity: 2 } },
  } });
  const checkoutId = `checkout_${id}`;
  const order = await db.order.create({ data: {
    orderNumber: `DGN-TEST-${id}`,
    idempotencyKey: `idem-${id}`,
    fulfilmentType: "PICKUP",
    subtotal: "480.50",
    shippingFee: "0.00",
    total: overrides.orderTotal ?? "480.50",
    customerName: "Phase Six C",
    customerEmail: user.email,
    pickupLocation: "TEST pickup",
    userId: user.id,
    status: overrides.orderStatus ?? "PENDING",
    paymentStatus: overrides.orderPaymentStatus ?? "PENDING",
    confirmedAt: overrides.confirmedAt,
    cancelledAt: overrides.cancelledAt,
    inventoryReleasedAt: overrides.inventoryReleasedAt,
    payment: { create: {
      amount: overrides.paymentAmount ?? "480.50",
      provider: "YOCO",
      status: overrides.paymentStatus ?? "PENDING",
      transactionId: overrides.transactionId,
      providerCheckoutId: checkoutId,
    } },
  }, include: { payment: true } });
  return { user, cart, variant, order, checkoutId };
}

function successfulEvent(f, overrides = {}) {
  return {
    createdDate: new Date().toISOString(),
    id: overrides.eventId ?? `event_${randomUUID()}`,
    type: overrides.eventType ?? "payment.succeeded",
    payload: {
      amount: overrides.amount ?? 48050,
      createdDate: new Date().toISOString(),
      currency: overrides.currency ?? "ZAR",
      id: overrides.paymentId ?? `payment_${f.order.id}`,
      mode: "test",
      status: overrides.payloadStatus ?? "succeeded",
      type: overrides.payloadType ?? "payment",
      metadata: {
        checkoutId: overrides.checkoutId ?? f.checkoutId,
        orderNumber: overrides.orderNumber ?? "UNTRUSTED-ORDER-NUMBER",
        orderId: overrides.orderId ?? "UNTRUSTED-ORDER-ID",
      },
    },
  };
}

function sign(rawBody, webhookId, webhookTimestamp, key = secretBytes) {
  return createHmac("sha256", key)
    .update(`${webhookId}.${webhookTimestamp}.${rawBody}`, "utf8")
    .digest("base64");
}

async function deliver(event, options = {}) {
  const rawBody = options.rawBody ?? JSON.stringify(event);
  const eventId = typeof event?.id === "string" && event.id
    ? event.id
    : `event_${randomUUID()}`;
  const webhookId = options.webhookId ?? eventId;
  const webhookTimestamp = options.webhookTimestamp ?? String(Math.floor(Date.now() / 1000));
  const webhookSignature = options.webhookSignature ?? `v1,${sign(rawBody, webhookId, webhookTimestamp)}`;
  return context.run(options.context ?? {}, async () => {
    const response = await app.POST(new Request("https://shop.example/api/webhooks/yoco", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": webhookId,
        "webhook-timestamp": webhookTimestamp,
        "webhook-signature": webhookSignature,
      },
      body: rawBody,
    }));
    return { status: response.status, body: await response.json() };
  });
}

async function state(f) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: f.order.id }, include: { payment: true },
  });
  return {
    order,
    inventory: (await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity,
    cart: await db.cartItem.findMany({ where: { cartId: f.cart.id }, orderBy: { id: "asc" } }),
    orderCount: await db.order.count({ where: { id: f.order.id } }),
    paymentCount: await db.payment.count({ where: { orderId: f.order.id } }),
  };
}

function assertPending(snapshot) {
  assert.equal(snapshot.order.status, "PENDING");
  assert.equal(snapshot.order.paymentStatus, "PENDING");
  assert.equal(snapshot.order.confirmedAt, null);
  assert.equal(snapshot.order.payment.status, "PENDING");
  assert.equal(snapshot.order.payment.transactionId, null);
}

function assertUnrelatedStateUnchanged(before, after) {
  assert.equal(after.inventory, before.inventory);
  assert.deepEqual(after.cart, before.cart);
  assert.equal(after.orderCount, 1);
  assert.equal(after.paymentCount, 1);
  assert.equal(after.order.payment.providerCheckoutId, before.order.payment.providerCheckoutId);
}

test("valid payment success atomically confirms authoritative Payment and Order only", async () => {
  const f = await fixture();
  const before = await state(f);
  const event = successfulEvent(f);
  const result = await deliver(event);
  assert.deepEqual(result, { status: 200, body: { ok: true, result: "processed" } });
  const after = await state(f);
  assert.equal(after.order.payment.status, "PAID");
  assert.equal(after.order.payment.transactionId, event.payload.id);
  assert.equal(after.order.paymentStatus, "PAID");
  assert.equal(after.order.status, "CONFIRMED");
  assert.ok(after.order.confirmedAt instanceof Date);
  assert.equal(after.order.cancelledAt, null);
  assert.equal(after.order.inventoryReleasedAt, null);
  assertUnrelatedStateUnchanged(before, after);
});

for (const [name, overrides, expectedStatus] of [
  ["wrong amount", { amount: 48049 }, 409],
  ["fractional amount", { amount: 48050.5 }, 400],
  ["zero amount", { amount: 0 }, 400],
  ["negative amount", { amount: -1 }, 400],
  ["wrong currency", { currency: "USD" }, 409],
]) {
  test(`${name} cannot confirm a known checkout`, async () => {
    const f = await fixture();
    const before = await state(f);
    const result = await deliver(successfulEvent(f, overrides));
    assert.equal(result.status, expectedStatus);
    const after = await state(f);
    assertPending(after);
    assertUnrelatedStateUnchanged(before, after);
  });
}

test("authoritative Payment and Order amount disagreement is a conflict", async () => {
  const f = await fixture({ paymentAmount: "480.49" });
  const before = await state(f);
  assert.equal((await deliver(successfulEvent(f))).status, 409);
  const after = await state(f);
  assertPending(after);
  assertUnrelatedStateUnchanged(before, after);
});

test("unknown checkout IDs are acknowledged and arbitrary metadata cannot redirect updates", async () => {
  const f = await fixture();
  const other = await fixture();
  const before = await state(f);
  const unknown = successfulEvent(f, {
    checkoutId: "checkout_unknown",
    orderId: other.order.id,
    orderNumber: other.order.orderNumber,
  });
  assert.deepEqual(await deliver(unknown), { status: 200, body: { ok: true, result: "ignored" } });
  const unchanged = await state(f);
  assertPending(unchanged);
  assertUnrelatedStateUnchanged(before, unchanged);

  const targeted = successfulEvent(f, {
    orderId: other.order.id,
    orderNumber: other.order.orderNumber,
  });
  assert.equal((await deliver(targeted)).status, 200);
  assert.equal((await state(f)).order.status, "CONFIRMED");
  assertPending(await state(other));
});

test("sequential duplicate deliveries are idempotent and preserve confirmedAt", async () => {
  const f = await fixture();
  const event = successfulEvent(f);
  assert.equal((await deliver(event)).body.result, "processed");
  const confirmedAt = (await state(f)).order.confirmedAt;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await deliver(event);
    assert.deepEqual(result, { status: 200, body: { ok: true, result: "duplicate" } });
    assert.equal((await state(f)).order.confirmedAt.getTime(), confirmedAt.getTime());
  }
});

test("concurrent duplicate deliveries converge on one transition without state corruption", async () => {
  const f = await fixture();
  const before = await state(f);
  const event = successfulEvent(f);
  const results = await Promise.all(Array.from({ length: 8 }, () => deliver(event)));
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(results.filter((result) => result.body.result === "processed").length, 1);
  assert.equal(results.filter((result) => result.body.result === "duplicate").length, 7);
  const after = await state(f);
  assert.equal(after.order.status, "CONFIRMED");
  assert.equal(after.order.payment.transactionId, event.payload.id);
  assertUnrelatedStateUnchanged(before, after);
});

test("a conflicting transaction ID never replaces the recorded payment ID", async () => {
  const f = await fixture();
  const event = successfulEvent(f);
  assert.equal((await deliver(event)).status, 200);
  const confirmedAt = (await state(f)).order.confirmedAt;
  assert.equal((await deliver(successfulEvent(f, { paymentId: event.payload.id }))).status, 200);
  const conflict = await deliver(successfulEvent(f, { paymentId: "payment_conflicting" }));
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.body, { ok: false, message: "Payment reconciliation conflict." });
  const after = await state(f);
  assert.equal(after.order.payment.transactionId, event.payload.id);
  assert.equal(after.order.confirmedAt.getTime(), confirmedAt.getTime());
});

test("a duplicate success does not move an already paid order backwards", async () => {
  for (const orderStatus of ["PROCESSING", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED"]) {
    const confirmedAt = new Date(Date.now() - 60_000);
    const paymentId = `payment_${randomUUID()}`;
    const f = await fixture({
      orderStatus,
      orderPaymentStatus: "PAID",
      confirmedAt,
      paymentStatus: "PAID",
      transactionId: paymentId,
    });
    const result = await deliver(successfulEvent(f, { paymentId }));
    assert.deepEqual(result, { status: 200, body: { ok: true, result: "duplicate" } });
    const after = await state(f);
    assert.equal(after.order.status, orderStatus);
    assert.equal(after.order.confirmedAt.getTime(), confirmedAt.getTime());
    assert.equal(after.order.payment.transactionId, paymentId);
  }
});

test("verified irrelevant events are acknowledged without database mutation", async () => {
  const f = await fixture();
  const before = await state(f);
  for (const type of ["refund.succeeded", "refund.failed", "payment.failed", "future.event"] ) {
    const event = { id: `event_${randomUUID()}`, type, payload: { metadata: { checkoutId: f.checkoutId } } };
    assert.deepEqual(await deliver(event), { status: 200, body: { ok: true, result: "ignored" } });
  }
  const after = await state(f);
  assertPending(after);
  assertUnrelatedStateUnchanged(before, after);
});

test("signed malformed JSON or event schema returns 400 with no mutation", async () => {
  const f = await fixture();
  const before = await state(f);
  assert.equal((await deliver(null, { rawBody: "{" })).status, 400);
  for (const event of [
    null, [], {}, { id: "", type: "payment.succeeded" },
    { id: "event", type: "" },
    { id: "event", type: "payment.succeeded" },
    { ...successfulEvent(f), payload: null },
    successfulEvent(f, { paymentId: "" }),
    successfulEvent(f, { payloadType: "refund" }),
    successfulEvent(f, { payloadStatus: "failed" }),
    { ...successfulEvent(f), payload: { ...successfulEvent(f).payload, metadata: {} } },
  ]) {
    assert.equal((await deliver(event)).status, 400);
  }
  const after = await state(f);
  assertPending(after);
  assertUnrelatedStateUnchanged(before, after);
});

for (const failureStage of ["before", "after"]) {
  test(`transient database failure ${failureStage} Payment write rolls back and retry succeeds`, async () => {
    const f = await fixture();
    const before = await state(f);
    const event = successfulEvent(f);
    const failed = await deliver(event, { context: { failPaymentUpdate: failureStage } });
    assert.deepEqual(failed, {
      status: 503,
      body: { ok: false, message: "Webhook processing temporarily unavailable." },
    });
    const rolledBack = await state(f);
    assertPending(rolledBack);
    assertUnrelatedStateUnchanged(before, rolledBack);
    assert.equal((await deliver(event)).status, 200);
    assert.equal((await state(f)).order.status, "CONFIRMED");
  });
}

test("a successful notification cannot resurrect a cancelled or released order", async () => {
  for (const overrides of [
    { orderStatus: "CANCELLED", cancelledAt: new Date() },
    { inventoryReleasedAt: new Date() },
    { orderStatus: "PROCESSING" },
  ]) {
    const f = await fixture(overrides);
    const before = await state(f);
    assert.equal((await deliver(successfulEvent(f))).status, 409);
    const after = await state(f);
    assert.equal(after.order.status, before.order.status);
    assert.equal(after.order.payment.status, "PENDING");
    assert.equal(after.order.payment.transactionId, null);
    assertUnrelatedStateUnchanged(before, after);
  }
});

test("route returns controlled verification and configuration errors", async () => {
  const f = await fixture();
  const event = successfulEvent(f);
  const invalid = await deliver(event, { webhookSignature: `v1,${Buffer.alloc(32).toString("base64")}` });
  assert.deepEqual(invalid, { status: 403, body: { ok: false, message: "Webhook verification failed." } });
  delete process.env.YOCO_WEBHOOK_SECRET;
  const missingConfig = await deliver(event);
  assert.deepEqual(missingConfig, { status: 503, body: { ok: false, message: "Yoco webhook verification is not configured." } });
  assertPending(await state(f));
});
