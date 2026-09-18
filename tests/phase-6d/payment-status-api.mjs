// Run: node --test tests/phase-6d/payment-status-api.mjs
// Fresh loopback PostgreSQL only. Creates dedicated test records and performs read-only route calls.
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
  const cache = path.join(root, "node_modules/.cache/phase-6d-tests");
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

  const connection = { host: "127.0.0.1", port, user: "phase6d", database: "postgres", ssl: false };
  command(executable("initdb"), ["-D", dataDir, "-U", "phase6d", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  command(executable("pg_ctl"), ["-D", dataDir, "-l", path.join(runDir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;

  observer = new pg.Pool(connection);
  const ddl = command(process.execPath, [
    path.join(root, "node_modules/prisma/build/index.js"),
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema",
    "prisma/schema.prisma",
    "--script",
  ]);
  assert.ok(!/^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im.test(ddl));
  await observer.query(ddl.slice(ddl.indexOf("-- Create")));

  db = new PrismaClient({ adapter: new PrismaPg(connection) });
  globalThis.__deigonPhase6d = { client: db, context };

  const bundle = await build({
    stdin: {
      contents: `export { GET } from './app/api/orders/[orderId]/payment-status/route';`,
      resolveDir: root,
      sourcefile: "phase-6d-payment-status-api.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: [{
      name: "phase6d-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/(prisma|auth\/require-user)$/ }, ({ path: importPath }) => ({
          path: importPath,
          namespace: "test-boundary",
        }));
        builder.onLoad({ filter: /.*/, namespace: "test-boundary" }, ({ path: importPath }) => ({
          contents: importPath.endsWith("/prisma")
            ? "export const prisma = globalThis.__deigonPhase6d.client;"
            : `export class AuthError extends Error {
                constructor(message, status) { super(message); this.status = status; }
              }
              export async function requireUser() {
                const user = globalThis.__deigonPhase6d.context.getStore()?.user;
                if (!user) throw new AuthError("Authentication required", 401);
                return user;
              }`,
        }));
      },
    }],
  });

  const loaded = new Module(path.join(root, "phase-6d-payment-status-api.cjs"));
  loaded.filename = path.join(root, "phase-6d-payment-status-api.cjs");
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
      delete globalThis.__deigonPhase6d;
    }
  }
});

async function fixture() {
  const id = randomUUID();
  const owner = await db.user.create({ data: { id, email: `${id}@example.invalid` } });
  const otherId = randomUUID();
  const other = await db.user.create({ data: { id: otherId, email: `${otherId}@example.invalid` } });
  const category = await db.category.create({ data: { name: "Phase 6D TEST", slug: id } });
  const product = await db.product.create({ data: { name: "Phase 6D TEST", slug: id, categoryId: category.id } });
  const variant = await db.productVariant.create({ data: {
    sku: id,
    price: "480.50",
    productId: product.id,
    inventory: { create: { quantity: 7 } },
  }, include: { inventory: true } });
  const cart = await db.cart.create({ data: {
    userId: owner.id,
    items: { create: { productId: product.id, variantId: variant.id, quantity: 1 } },
  } });
  const order = await db.order.create({ data: {
    orderNumber: `DGN-TEST-${id}`,
    idempotencyKey: `idem-${id}`,
    fulfilmentType: "DELIVERY",
    subtotal: "400.50",
    shippingFee: "80.00",
    total: "480.50",
    customerName: "Phase Six D",
    customerEmail: owner.email,
    shippingAddressLine1: "TEST address",
    shippingCity: "TEST city",
    shippingProvince: "Limpopo",
    shippingPostalCode: "0000",
    shippingCountry: "South Africa",
    userId: owner.id,
    payment: { create: {
      amount: "480.50",
      provider: "YOCO",
      providerCheckoutId: `checkout_${id}`,
    } },
  }, include: { payment: true } });

  return { owner, other, variant, cart, order };
}

async function read(user, orderId) {
  return context.run({ user }, async () => {
    const response = await app.GET(
      new Request(`https://shop.example/api/orders/${encodeURIComponent(orderId)}/payment-status`),
      { params: Promise.resolve({ orderId }) },
    );
    return { status: response.status, body: await response.json() };
  });
}

async function state(fixtureData) {
  return {
    order: await db.order.findUniqueOrThrow({
      where: { id: fixtureData.order.id },
      include: { payment: true },
    }),
    inventory: await db.inventory.findUniqueOrThrow({ where: { variantId: fixtureData.variant.id } }),
    cartItems: await db.cartItem.findMany({ where: { cartId: fixtureData.cart.id }, orderBy: { id: "asc" } }),
  };
}

test("the authenticated owner receives only the customer-safe payment status shape", async () => {
  const f = await fixture();
  const result = await read(f.owner, f.order.id);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    ok: true,
    order: {
      id: f.order.id,
      orderNumber: f.order.orderNumber,
      status: "PENDING",
      paymentStatus: "PENDING",
      fulfilmentType: "DELIVERY",
      total: "480.50",
      confirmedAt: null,
    },
    payment: { provider: "YOCO", status: "PENDING" },
  });

  const serialized = JSON.stringify(result.body);
  for (const forbidden of ["transactionId", "providerCheckoutId", "idempotencyKey", "customerEmail", "customerName"]) {
    assert.ok(!serialized.includes(forbidden));
  }
});

test("unauthenticated, foreign, unknown and malformed requests are safely rejected", async () => {
  const f = await fixture();
  assert.deepEqual(await read(null, f.order.id), {
    status: 401,
    body: { ok: false, message: "Authentication required" },
  });

  const foreign = await read(f.other, f.order.id);
  const unknown = await read(f.owner, "cmg_unknown_order_123");
  const malformed = await read(f.owner, "<script>");
  assert.deepEqual(foreign, { status: 404, body: { ok: false, message: "Order not found" } });
  assert.deepEqual(unknown, foreign);
  assert.deepEqual(malformed, foreign);
  assert.ok(!JSON.stringify(foreign).includes(f.order.orderNumber));
});

test("paid and progressed paid records are returned without being rewritten", async () => {
  for (const status of ["CONFIRMED", "PROCESSING", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED"]) {
    const f = await fixture();
    const confirmedAt = new Date("2026-09-18T10:00:00.000Z");
    await db.payment.update({ where: { orderId: f.order.id }, data: { status: "PAID", transactionId: `payment_${f.order.id}` } });
    await db.order.update({ where: { id: f.order.id }, data: { status, paymentStatus: "PAID", confirmedAt } });

    const before = await state(f);
    const result = await read(f.owner, f.order.id);
    const after = await state(f);

    assert.equal(result.status, 200);
    assert.equal(result.body.order.status, status);
    assert.equal(result.body.order.paymentStatus, "PAID");
    assert.equal(result.body.payment.status, "PAID");
    assert.equal(result.body.order.confirmedAt, confirmedAt.toISOString());
    assert.deepEqual(after, before);
  }
});

test("all payment-status reads leave order, payment, inventory and cart state unchanged", async () => {
  const f = await fixture();
  const before = await state(f);

  await read(f.owner, f.order.id);
  await read(f.other, f.order.id);
  await read(f.owner, "cmg_unknown_order_123");
  await read(f.owner, "<script>");

  const after = await state(f);
  assert.deepEqual(after, before);
});
