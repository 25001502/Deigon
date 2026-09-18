// Run: node --test tests/phase-6e/expire-unpaid-orders.mjs
// Fresh loopback PostgreSQL only. No external Yoco calls and no production data access.
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import Module from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bin = process.env.DEIGON_TEST_PG_BIN || path.join(root, "node_modules/.cache/phase-5-postgres/package/native/bin");
const executable = (name) => path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const context = new AsyncLocalStorage();
const now = new Date("2026-09-18T12:00:00.000Z");
const cutoff = new Date(now.getTime() - 60 * 60_000);
let db;
let observer;
let app;
let dataDir;
let started = false;

function command(file, args) {
  return execFileSync(file, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: path.basename(file).startsWith("pg_ctl") ? "ignore" : "pipe",
  });
}

before(async () => {
  const cache = path.join(root, "node_modules/.cache/phase-6e-tests");
  mkdirSync(cache, { recursive: true });
  const runDir = mkdtempSync(path.join(cache, "run-"));
  dataDir = path.join(runDir, "data");

  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));

  const connection = { host: "127.0.0.1", port, user: "phase6e", database: "postgres", ssl: false };
  command(executable("initdb"), ["-D", dataDir, "-U", "phase6e", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  command(executable("pg_ctl"), ["-D", dataDir, "-l", path.join(runDir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;

  observer = new pg.Pool(connection);
  const ddl = command(process.execPath, [
    path.join(root, "node_modules/prisma/build/index.js"),
    "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script",
  ]);
  assert.ok(!/^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im.test(ddl));
  await observer.query(ddl.slice(ddl.indexOf("-- Create")));

  db = new PrismaClient({ adapter: new PrismaPg(connection) });
  const instrumented = db.$extends({
    query: {
      inventory: {
        async update(event) {
          const result = await event.query(event.args);
          const store = context.getStore();
          if (store?.failAfterFirstInventoryUpdate) {
            store.inventoryUpdates = (store.inventoryUpdates ?? 0) + 1;
            if (store.inventoryUpdates === 1) throw new Error("TEST ONLY inventory update failure");
          }
          return result;
        },
      },
    },
  });

  globalThis.__deigonPhase6e = { client: instrumented, context };
  const bundle = await build({
    stdin: {
      contents: `export * from './lib/orders/expire-unpaid-orders';
        export * from './lib/orders/unpaid-order-expiry-config';
        export * from './lib/payments/prepare-order-payment';
        export * from './lib/payments/process-yoco-webhook';`,
      resolveDir: root,
      sourcefile: "phase-6e-entry.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: [{
      name: "phase6e-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^(server-only|@\/lib\/(prisma|payments\/yoco))$/ }, ({ path: importPath }) => ({
          path: importPath,
          namespace: "test-boundary",
        }));
        builder.onLoad({ filter: /.*/, namespace: "test-boundary" }, ({ path: importPath }) => ({
          contents: importPath === "server-only"
            ? ""
            : importPath.endsWith("/prisma")
              ? "export const prisma = globalThis.__deigonPhase6e.client;"
              : `import { Prisma } from "@prisma/client";
                export async function createYocoCheckout(input) {
                  const provider = globalThis.__deigonPhase6e.context.getStore()?.provider;
                  if (!provider) throw new Error("TEST ONLY provider missing");
                  return provider(input);
                }
                export function decimalToCents(value) {
                  if (!(value instanceof Prisma.Decimal)) throw new Error("TEST ONLY invalid Decimal");
                  return Number(value.mul(100).toFixed(0));
                }`,
          resolveDir: root,
        }));
      },
    }],
  });

  const loaded = new Module(path.join(root, "phase-6e-test-bundle.cjs"));
  loaded.filename = path.join(root, "phase-6e-test-bundle.cjs");
  loaded.paths = Module._nodeModulePaths(root);
  loaded._compile(bundle.outputFiles[0].text, loaded.filename);
  app = loaded.exports;
});

after(async () => {
  try {
    if (db) await db.$disconnect();
  } finally {
    try {
      if (observer) await observer.end();
    } finally {
      if (started) command(executable("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"]);
      delete globalThis.__deigonPhase6e;
    }
  }
});

async function fixture(options = {}) {
  const id = randomUUID();
  const user = await db.user.create({ data: { id, email: `${id}@example.invalid` } });
  const category = await db.category.create({ data: { name: "Phase 6E TEST", slug: id } });
  const product = await db.product.create({ data: { name: "Phase 6E TEST", slug: id, categoryId: category.id } });
  const inventoryQuantities = options.inventoryQuantities ?? [10];
  const variants = [];

  for (let index = 0; index < inventoryQuantities.length; index += 1) {
    const quantity = inventoryQuantities[index];
    variants.push(await db.productVariant.create({
      data: {
        sku: `${id}-${index}`,
        price: "200.25",
        productId: product.id,
        ...(quantity === null ? {} : { inventory: { create: { quantity } } }),
      },
      include: { inventory: true },
    }));
  }

  const itemSpecs = options.items ?? [{ variantIndex: 0, quantity: 2 }];
  const orderItems = itemSpecs.map((item, index) => ({
    quantity: item.quantity,
    unitPrice: "200.25",
    lineTotal: "400.50",
    title: `Phase 6E item ${index}`,
    sku: `snapshot-${id}-${index}`,
    size: index % 2 === 0 ? "TEST-S" : "TEST-L",
    color: index % 2 === 0 ? "TEST-BLACK" : "TEST-WHITE",
    productId: product.id,
    variantId: item.variantIndex === null ? null : variants[item.variantIndex].id,
  }));
  const total = "400.50";
  const order = await db.order.create({
    data: {
      orderNumber: `DGN-6E-${id}`,
      idempotencyKey: `idem-${id}`,
      status: options.orderStatus ?? "PENDING",
      paymentStatus: options.orderPaymentStatus ?? "PENDING",
      fulfilmentType: "DELIVERY",
      subtotal: total,
      shippingFee: "0.00",
      total,
      customerName: "Phase Six E",
      customerEmail: user.email,
      customerPhone: "0000000000",
      shippingAddressLine1: "TEST address",
      shippingCity: "TEST city",
      shippingProvince: "Limpopo",
      shippingPostalCode: "0000",
      shippingCountry: "South Africa",
      userId: user.id,
      createdAt: options.createdAt ?? new Date(now.getTime() - 120 * 60_000),
      confirmedAt: options.confirmedAt,
      cancelledAt: options.cancelledAt,
      inventoryReleasedAt: options.inventoryReleasedAt,
      items: { create: orderItems },
      payment: { create: {
        amount: total,
        provider: options.provider ?? "YOCO",
        status: options.paymentStatus ?? "PENDING",
        transactionId: options.transactionId,
        providerCheckoutId: options.providerCheckoutId,
      } },
    },
    include: { payment: true, items: true },
  });

  const cart = await db.cart.create({
    data: {
      userId: user.id,
      items: { create: { productId: product.id, variantId: variants[0].id, quantity: 3 } },
    },
  });

  return { user, category, product, variants, order, cart };
}

async function state(f) {
  return {
    order: await db.order.findUniqueOrThrow({
      where: { id: f.order.id },
      include: { payment: true, items: { orderBy: { id: "asc" } } },
    }),
    inventories: await db.inventory.findMany({
      where: { variantId: { in: f.variants.map((variant) => variant.id) } },
      orderBy: { variantId: "asc" },
    }),
    cartItems: await db.cartItem.findMany({
      where: { cartId: f.cart.id },
      orderBy: { id: "asc" },
    }),
  };
}

function runExpiry(options = {}) {
  return app.expireUnpaidOrders({ ttlMinutes: 60, now, ...options });
}

function assertPending(snapshot) {
  assert.equal(snapshot.order.status, "PENDING");
  assert.equal(snapshot.order.paymentStatus, "PENDING");
  assert.equal(snapshot.order.confirmedAt, null);
  assert.equal(snapshot.order.cancelledAt, null);
  assert.equal(snapshot.order.inventoryReleasedAt, null);
  assert.equal(snapshot.order.payment.status, "PENDING");
}

test("TTL configuration fails closed outside the bounded positive integer range", () => {
  for (const value of [undefined, "", " ", "abc", "1.5", "0", "4", "10081", "-60", "60 minutes"]) {
    assert.throws(() => app.parseUnpaidOrderTtlMinutes(value), app.UnpaidOrderExpiryConfigError);
  }
  assert.equal(app.parseUnpaidOrderTtlMinutes("5"), 5);
  assert.equal(app.parseUnpaidOrderTtlMinutes("60"), 60);
  assert.equal(app.parseUnpaidOrderTtlMinutes("10080"), 10080);
});

test("an old local-only reservation expires atomically and preserves cart and snapshots", async () => {
  const f = await fixture();
  const before = await state(f);
  const summary = await runExpiry();
  const after = await state(f);

  assert.equal(summary.expired, 1);
  assert.equal(after.inventories[0].quantity, before.inventories[0].quantity + 2);
  assert.equal(after.order.status, "CANCELLED");
  assert.equal(after.order.paymentStatus, "FAILED");
  assert.equal(after.order.payment.status, "FAILED");
  assert.equal(after.order.payment.transactionId, null);
  assert.equal(after.order.payment.providerCheckoutId, null);
  assert.equal(after.order.confirmedAt, null);
  assert.equal(after.order.cancelledAt.getTime(), now.getTime());
  assert.equal(after.order.inventoryReleasedAt.getTime(), now.getTime());
  assert.equal(after.order.cancelledAt.getTime(), after.order.inventoryReleasedAt.getTime());
  assert.deepEqual(after.cartItems, before.cartItems);
  assert.deepEqual(after.order.items, before.order.items);
  assert.equal(after.order.customerName, before.order.customerName);
  assert.equal(after.order.customerEmail, before.order.customerEmail);
  assert.equal(after.order.shippingAddressLine1, before.order.shippingAddressLine1);
});

test("quantities are aggregated per variant and multiple variants restore exactly", async () => {
  const f = await fixture({
    inventoryQuantities: [11, 17],
    items: [
      { variantIndex: 1, quantity: 4 },
      { variantIndex: 0, quantity: 2 },
      { variantIndex: 0, quantity: 3 },
    ],
  });
  const before = await state(f);
  await runExpiry();
  const after = await state(f);
  const beforeByVariant = new Map(before.inventories.map((inventory) => [inventory.variantId, inventory.quantity]));
  const afterByVariant = new Map(after.inventories.map((inventory) => [inventory.variantId, inventory.quantity]));
  assert.equal(afterByVariant.get(f.variants[0].id), beforeByVariant.get(f.variants[0].id) + 5);
  assert.equal(afterByVariant.get(f.variants[1].id), beforeByVariant.get(f.variants[1].id) + 4);
});

test("repeated and concurrent expiry runs release a reservation exactly once", async () => {
  const repeated = await fixture();
  const repeatedBefore = await state(repeated);
  assert.equal((await runExpiry()).expired, 1);
  assert.equal((await runExpiry()).expired, 0);
  assert.equal((await state(repeated)).inventories[0].quantity, repeatedBefore.inventories[0].quantity + 2);

  const concurrent = await fixture();
  const concurrentBefore = await state(concurrent);
  const results = await Promise.all([runExpiry(), runExpiry()]);
  assert.equal(results.reduce((total, result) => total + result.expired, 0), 1);
  const concurrentAfter = await state(concurrent);
  assert.equal(concurrentAfter.inventories[0].quantity, concurrentBefore.inventories[0].quantity + 2);
  assert.equal(concurrentAfter.order.status, "CANCELLED");
});

test("ineligible lifecycle and payment states remain untouched", async () => {
  const cases = [
    { createdAt: new Date(now.getTime() - 30 * 60_000) },
    { paymentStatus: "PAID", transactionId: "payment-paid" },
    { orderPaymentStatus: "PAID" },
    { orderStatus: "CONFIRMED", orderPaymentStatus: "PAID", paymentStatus: "PAID", transactionId: "payment-confirmed", confirmedAt: now },
    { orderStatus: "PROCESSING", orderPaymentStatus: "PAID", paymentStatus: "PAID", transactionId: "payment-processing", confirmedAt: now },
    { orderStatus: "SHIPPED", orderPaymentStatus: "PAID", paymentStatus: "PAID", transactionId: "payment-shipped", confirmedAt: now },
    { orderStatus: "READY_FOR_PICKUP", orderPaymentStatus: "PAID", paymentStatus: "PAID", transactionId: "payment-ready", confirmedAt: now },
    { orderStatus: "DELIVERED", orderPaymentStatus: "PAID", paymentStatus: "PAID", transactionId: "payment-delivered", confirmedAt: now },
    { inventoryReleasedAt: new Date(now.getTime() - 10_000) },
    { orderStatus: "CANCELLED", cancelledAt: new Date(now.getTime() - 10_000) },
    { transactionId: "payment-unexpected" },
    { provider: "OTHER" },
  ];

  for (const options of cases) {
    const f = await fixture(options);
    const before = await state(f);
    await runExpiry();
    assert.deepEqual(await state(f), before);
  }
});

test("provider-backed stale reservations are reported and never released", async () => {
  const f = await fixture({ providerCheckoutId: `checkout_${randomUUID()}` });
  const before = await state(f);
  const summary = await runExpiry();
  assert.ok(summary.providerBacked >= 1);
  assert.deepEqual(await state(f), before);
});

test("missing inventory or unusable variant references block the whole transition", async () => {
  for (const options of [
    { inventoryQuantities: [null] },
    { items: [{ variantIndex: null, quantity: 2 }] },
  ]) {
    const f = await fixture(options);
    const before = await state(f);
    const summary = await runExpiry();
    assert.ok(summary.blocked >= 1);
    const after = await state(f);
    assertPending(after);
    assert.deepEqual(after.inventories, before.inventories);
    assert.deepEqual(after.cartItems, before.cartItems);
  }
});

test("a failure after one inventory update rolls back all inventory and lifecycle writes", async () => {
  const f = await fixture({
    inventoryQuantities: [5, 9],
    items: [{ variantIndex: 0, quantity: 2 }, { variantIndex: 1, quantity: 3 }],
  });
  const before = await state(f);
  const store = { failAfterFirstInventoryUpdate: true, inventoryUpdates: 0 };
  await assert.rejects(
    context.run(store, () => runExpiry()),
    /TEST ONLY inventory update failure/,
  );
  const after = await state(f);
  assertPending(after);
  assert.deepEqual(after.inventories, before.inventories);
  assert.deepEqual(after.cartItems, before.cartItems);
});

test("different orders sharing variants use deterministic inventory ordering without deadlock", async () => {
  const f = await fixture({
    inventoryQuantities: [20, 30],
    items: [{ variantIndex: 1, quantity: 2 }, { variantIndex: 0, quantity: 1 }],
  });
  const secondId = randomUUID();
  const second = await db.order.create({
    data: {
      orderNumber: `DGN-6E-${secondId}`,
      idempotencyKey: `idem-${secondId}`,
      fulfilmentType: "PICKUP",
      subtotal: "400.50",
      shippingFee: "0.00",
      total: "400.50",
      customerName: "Phase Six E Two",
      customerEmail: f.user.email,
      pickupLocation: "TEST pickup",
      userId: f.user.id,
      createdAt: new Date(now.getTime() - 119 * 60_000),
      items: { create: [
        { quantity: 3, unitPrice: "200.25", lineTotal: "400.50", title: "Second B", sku: `snapshot-${secondId}-b`, productId: f.product.id, variantId: f.variants[0].id },
        { quantity: 4, unitPrice: "200.25", lineTotal: "400.50", title: "Second A", sku: `snapshot-${secondId}-a`, productId: f.product.id, variantId: f.variants[1].id },
      ] },
      payment: { create: { amount: "400.50", provider: "YOCO" } },
    },
  });
  const before = await state(f);

  const results = await Promise.all([
    app.expireUnpaidOrderCandidate(f.order.id, cutoff, now),
    app.expireUnpaidOrderCandidate(second.id, cutoff, now),
  ]);
  assert.deepEqual(results.sort(), ["expired", "expired"]);

  const after = await state(f);
  const beforeByVariant = new Map(before.inventories.map((inventory) => [inventory.variantId, inventory.quantity]));
  const afterByVariant = new Map(after.inventories.map((inventory) => [inventory.variantId, inventory.quantity]));
  assert.equal(afterByVariant.get(f.variants[0].id), beforeByVariant.get(f.variants[0].id) + 4);
  assert.equal(afterByVariant.get(f.variants[1].id), beforeByVariant.get(f.variants[1].id) + 6);
});

test("provider checkout persistence wins before expiry, so inventory stays reserved", async () => {
  const f = await fixture();
  const before = await state(f);
  const checkoutId = `checkout_${randomUUID()}`;
  const payment = await context.run({
    provider: async () => ({ checkoutId, redirectUrl: `https://c.yoco.com/${checkoutId}` }),
  }, () => app.prepareOrderPayment(f.user.id, f.order.id, {
    successUrl: "https://shop.example/success",
    cancelUrl: "https://shop.example/cancel",
    failureUrl: "https://shop.example/failure",
  }));
  assert.equal(payment.redirectUrl, `https://c.yoco.com/${checkoutId}`);

  const summary = await runExpiry();
  assert.ok(summary.providerBacked >= 1);
  const after = await state(f);
  assert.equal(after.order.payment.providerCheckoutId, checkoutId);
  assert.equal(after.inventories[0].quantity, before.inventories[0].quantity);
  assertPending(after);
});

test("expiry winning before provider persistence cannot resurrect the reservation", async () => {
  const f = await fixture();
  const before = await state(f);
  let providerReached;
  let releaseProvider;
  const reached = new Promise((resolve) => { providerReached = resolve; });
  const gate = new Promise((resolve) => { releaseProvider = resolve; });
  const checkoutId = `checkout_${randomUUID()}`;

  const preparation = context.run({
    provider: async () => {
      providerReached();
      await gate;
      return { checkoutId, redirectUrl: `https://c.yoco.com/${checkoutId}` };
    },
  }, () => app.prepareOrderPayment(f.user.id, f.order.id, {
    successUrl: "https://shop.example/success",
    cancelUrl: "https://shop.example/cancel",
    failureUrl: "https://shop.example/failure",
  }));

  await reached;
  assert.equal((await runExpiry()).expired, 1);
  releaseProvider();
  await assert.rejects(preparation, app.PaymentPreparationError);

  const after = await state(f);
  assert.equal(after.order.status, "CANCELLED");
  assert.equal(after.order.payment.status, "FAILED");
  assert.equal(after.order.payment.providerCheckoutId, null);
  assert.equal(after.inventories[0].quantity, before.inventories[0].quantity + 2);
});

test("successful and duplicate webhook deliveries keep provider-backed inventory reserved", async () => {
  const checkoutId = `checkout_${randomUUID()}`;
  const f = await fixture({ providerCheckoutId: checkoutId });
  const before = await state(f);
  const paymentId = `payment_${randomUUID()}`;
  const event = {
    id: `event_${randomUUID()}`,
    type: "payment.succeeded",
    payload: {
      id: paymentId,
      type: "payment",
      status: "succeeded",
      amount: 40050,
      currency: "ZAR",
      metadata: { checkoutId },
    },
  };

  assert.equal(await app.processYocoWebhook(event), "processed");
  assert.equal(await app.processYocoWebhook(event), "duplicate");
  await runExpiry();

  const after = await state(f);
  assert.equal(after.order.status, "CONFIRMED");
  assert.equal(after.order.paymentStatus, "PAID");
  assert.equal(after.order.payment.status, "PAID");
  assert.equal(after.order.payment.transactionId, paymentId);
  assert.equal(after.order.inventoryReleasedAt, null);
  assert.equal(after.inventories[0].quantity, before.inventories[0].quantity);
});
