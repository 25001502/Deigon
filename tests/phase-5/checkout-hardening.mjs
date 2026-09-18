/* Run with: node tests/phase-5/checkout-hardening.mjs
 * Uses a newly initialized, loopback-only PostgreSQL cluster, never DATABASE_URL.
 * Set DEIGON_TEST_PG_BIN to a directory containing initdb and pg_ctl.
 */
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import pg from 'pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const cache = path.join(root, 'node_modules/.cache/phase-5-tests');
const bin = process.env.DEIGON_TEST_PG_BIN || path.join(
  root, 'node_modules/.cache/phase-5-postgres/package/native/bin',
);
const executable = (name) => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
const context = new AsyncLocalStorage();
const results = [];
let db;
let observer;
let app;
let originalStock = [];
let originalProducts = [];

function command(file, args) {
  return execFileSync(file, args, {
    cwd: root, encoding: 'utf8', windowsHide: true,
    // PostgreSQL children can inherit pg_ctl's pipe handles on Windows.
    stdio: path.basename(file).startsWith('pg_ctl') ? 'ignore' : 'pipe',
  });
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// Bundle the actual route and services; replace only database wiring and identity resolution.
// Supabase cookie verification is deliberately outside this isolated integration suite.
async function loadApplication(client) {
  globalThis.__deigonPhase5 = { client, context };
  const bundled = await build({
    stdin: {
      contents: `export { POST } from './app/api/checkout/route';
        export * as cart from './lib/cart/service';
        export { errorResponse } from './lib/api/errors';`,
      resolveDir: root, sourcefile: 'phase-5-entry.ts', loader: 'ts',
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{
      name: 'isolated-test-boundaries',
      setup(build) {
        // Phase 5 exercises order/cart transactions independently of payment orchestration.
        build.onResolve({ filter: /^@\/lib\/payments\/prepare-order-payment$/ }, () => ({
          path: 'payment', namespace: 'phase5-payment',
        }));
        build.onLoad({ filter: /.*/, namespace: 'phase5-payment' }, () => ({
          contents: `export class PaymentPreparationError extends Error {}
            export function getPaymentReturnOrigin() { return 'https://shop.example'; }
            export function getPaymentReturnUrls() { return {}; }
            export async function prepareOrderPayment(_userId, orderId) {
              return { provider: 'YOCO', redirectUrl: 'https://c.yoco.com/test/' + orderId };
            }`,
        }));
        build.onResolve({ filter: /^@\/lib\/(prisma|auth\/require-user)$/ }, (args) => ({
          path: args.path, namespace: 'test-boundary',
        }));
        build.onLoad({ filter: /.*/, namespace: 'test-boundary' }, ({ path }) => ({
          contents: path.endsWith('/prisma')
            ? 'export const prisma = globalThis.__deigonPhase5.client;'
            : `export class AuthError extends Error {
                constructor(message, status) { super(message); this.status = status; }
              }
              export async function requireUser() {
                const user = globalThis.__deigonPhase5.context.getStore()?.user;
                if (!user) throw new AuthError('Authentication required', 401);
                return user;
              }`,
        }));
      },
    }],
  });
  const loaded = new Module(path.join(root, 'phase-5-test-bundle.cjs'));
  loaded.filename = path.join(root, 'phase-5-test-bundle.cjs');
  loaded.paths = Module._nodeModulePaths(root);
  loaded._compile(bundled.outputFiles[0].text, loaded.filename);
  return loaded.exports;
}

async function fixture(stock = 10, quantity = 1, price = '100.10') {
  const id = randomUUID();
  const category = await db.category.create({ data: { name: 'Phase 5 TEST', slug: `test-${id}` } });
  const product = await db.product.create({ data: {
    name: 'Phase 5 TEST', slug: `test-${id}`, categoryId: category.id,
  } });
  originalProducts.push({ id: product.id, isActive: product.isActive, updatedAt: product.updatedAt });
  const variant = await db.productVariant.create({ data: {
    sku: `TEST-${id}`, price, size: 'Test size', color: 'Test color', productId: product.id,
    inventory: { create: { quantity: stock } },
  }, include: { inventory: true } });
  originalStock.push({ id: variant.inventory.id, quantity: stock, updatedAt: variant.inventory.updatedAt });
  const users = [];
  for (let i = 0; i < 2; i++) {
    const user = await db.user.create({ data: { id: randomUUID(), email: `phase5-${id}-${i}@example.invalid` } });
    const cart = await db.cart.create({ data: { userId: user.id } });
    if (quantity > 0) await db.cartItem.create({ data: {
      cartId: cart.id, productId: product.id, variantId: variant.id, quantity,
    } });
    users.push({ ...user, cartId: cart.id });
  }
  return { users, variant, product };
}

function input(idempotencyKey = randomUUID(), overrides = {}) {
  return { idempotencyKey, fulfilmentType: 'PICKUP', customerName: 'Phase Five',
    customerEmail: 'phase5@example.invalid', pickupLocation: 'TEST pickup', ...overrides };
}

async function checkout(user, body = input(), hooks = {}) {
  return context.run({ user, ...hooks }, async () => {
    const response = await app.POST(new Request('http://localhost/api/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  });
}

async function mutate(user, operation, hooks = {}) {
  return context.run({ user, ...hooks }, async () => {
    try { return { status: 200, body: await operation() }; }
    catch (error) {
      const response = app.errorResponse(error);
      return { status: response.status, body: await response.json() };
    }
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function until(condition, description) {
  const deadline = Date.now() + 6000;
  while (!await condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${description}`);
    await delay(10);
  }
}

// Hold checkout A immediately after its cart snapshot. Let B finish, or observe
// PostgreSQL blocking B on A's row lock, before releasing A. No timing-only races.
async function overlap(user, body, second) {
  const gate = deferred();
  let captured = false;
  let firstDone = false;
  let secondDone = false;
  let secondRequest;
  const first = checkout(user, body, { after: async ({ model, operation, args }) => {
    if (model === 'Cart' && operation === 'findUnique' && args.select?.items) {
      captured = true;
      await gate.promise;
    }
  } }).finally(() => { firstDone = true; });
  try {
    await until(() => captured || firstDone, 'checkout cart snapshot');
    assert.ok(captured, 'checkout must reach its cart snapshot');
    secondRequest = second().finally(() => { secondDone = true; });
    await until(async () => {
      if (secondDone) return true;
      const blocked = await observer.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`);
      return blocked.rows[0].n > 0;
    }, 'second operation completes or blocks on a real database lock');
  } finally {
    gate.resolve();
    await Promise.allSettled([first, secondRequest].filter(Boolean));
  }
  return Promise.all([first, secondRequest]);
}

async function state(f) {
  const userIds = f.users.map((user) => user.id);
  return {
    inventory: (await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity,
    orders: await db.order.findMany({ where: { userId: { in: userIds } }, include: { items: true, payment: true } }),
    carts: await db.cartItem.findMany({ where: { cartId: { in: f.users.map((u) => u.cartId) } } }),
    payments: await db.payment.count({ where: { order: { userId: { in: userIds } } } }),
    orderItems: await db.orderItem.count({ where: { order: { userId: { in: userIds } } } }),
  };
}

function statuses(responses) { return responses.map((r) => r.status).sort(); }
function expectStatus(response, expected) {
  assert.equal(response.status, expected, JSON.stringify(response));
}

async function test(name, run) {
  originalStock = [];
  originalProducts = [];
  let failure;
  try { await run(); }
  catch (error) { failure = error.stack || String(error); }
  finally {
    // Exact primary keys from records created in this test, never production IDs.
    for (const { id, ...data } of originalStock) {
      await db.inventory.update({ where: { id }, data });
      assert.equal((await db.inventory.findUniqueOrThrow({ where: { id } })).quantity, data.quantity);
    }
    for (const { id, ...data } of originalProducts) await db.product.update({ where: { id }, data });
  }
  results.push({ name, passed: !failure, failure, inventoryRestored: true,
    originalInventory: originalStock, originalProducts });
  console.log(`${failure ? 'FAIL' : 'PASS'} ${name}${failure ? `\n${failure}` : ''}`);
}

async function suite() {
  await test('sequential replay returns one order/payment and preserves a newly added cart', async () => {
    const f = await fixture();
    const body = input();
    const first = await checkout(f.users[0], body);
    expectStatus(first, 201);
    await app.cart.addItem(f.users[0].id, { variantId: f.variant.id, quantity: 1 });
    const replay = await checkout(f.users[0], body);
    assert.deepEqual(replay, first);
    const s = await state(f);
    assert.equal(s.orders.length, 1); assert.equal(s.payments, 1); assert.equal(s.inventory, 9);
    assert.equal(s.carts.find((c) => c.cartId === f.users[0].cartId)?.quantity, 1);
  });

  for (const stock of [1, 10]) await test(`concurrent SAME key, stock=${stock}`, async () => {
    const f = await fixture(stock);
    const body = input();
    const responses = await overlap(f.users[0], body, () => checkout(f.users[0], body));
    assert.deepEqual(statuses(responses), [201, 201], JSON.stringify(responses));
    assert.equal(responses[0].body.order.id, responses[1].body.order.id);
    const s = await state(f);
    assert.equal(s.orders.length, 1); assert.equal(s.payments, 1); assert.equal(s.inventory, stock - 1);
  });

  await test('same cart with DIFFERENT keys cannot be consumed twice', async () => {
    const f = await fixture(10);
    const responses = await overlap(f.users[0], input(), () => checkout(f.users[0]));
    assert.deepEqual(statuses(responses), [201, 400], JSON.stringify(responses));
    const s = await state(f);
    assert.equal(s.orders.length, 1); assert.equal(s.payments, 1); assert.equal(s.inventory, 9);
  });

  for (const [stock, quantity] of [[1, 1], [3, 2]]) await test(`two users, stock=${stock}, quantity=${quantity}`, async () => {
    const f = await fixture(stock, quantity);
    const responses = await overlap(f.users[0], input(), () => checkout(f.users[1]));
    assert.deepEqual(statuses(responses), [201, 409], JSON.stringify(responses));
    const s = await state(f);
    assert.equal(s.orders.length, 1); assert.equal(s.payments, 1);
    assert.equal(s.inventory, stock - quantity); assert.ok(s.inventory >= 0);
    assert.equal(s.carts.length, 1);
  });

  for (const operation of ['update', 'remove', 'add-existing', 'add-new', 'clear', 'merge']) {
    await test(`checkout snapshot versus cart ${operation}`, async () => {
      const f = await fixture();
      const other = operation === 'add-new' ? await fixture() : f;
      const user = f.users[0];
      const actions = {
        update: () => app.cart.updateItem(user.id, f.variant.id, 2),
        remove: () => app.cart.removeItem(user.id, f.variant.id),
        'add-existing': () => app.cart.addItem(user.id, { variantId: f.variant.id, quantity: 1 }),
        'add-new': () => app.cart.addItem(user.id, { variantId: other.variant.id, quantity: 1 }),
        clear: () => app.cart.clearCart(user.id),
        merge: () => app.cart.mergeItems(user.id, [{ variantId: f.variant.id, quantity: 1 }]),
      };
      const [order, mutation] = await overlap(user, input(), () => mutate(user, actions[operation]));
      expectStatus(order, 201);
      const s = await state(f);
      const cart = s.carts.filter((line) => line.cartId === user.cartId);
      assert.equal(s.orders.length, 1); assert.equal(s.orders[0].items[0].quantity, 1);
      assert.equal(s.inventory, 9);
      if (operation === 'update' || operation === 'remove') {
        expectStatus(mutation, 404); // checkout held the cart first; stale line must fail cleanly
        assert.equal(cart.length, 0);
      } else if (operation === 'clear') {
        expectStatus(mutation, 200); assert.equal(cart.length, 0);
      } else {
        expectStatus(mutation, 200);
        assert.equal(cart.length, 1, 'successful add/merge must survive checkout');
        assert.equal(cart[0].quantity, 1);
        assert.equal(cart[0].variantId, other.variant.id);
      }
    });
  }

  for (const operation of ['update', 'remove', 'add-existing', 'add-new', 'clear', 'merge']) {
    await test(`cart ${operation} commits before waiting checkout`, async () => {
      const f = await fixture();
      const other = operation === 'add-new' ? await fixture() : f;
      const user = f.users[0];
      const actions = {
        update: () => app.cart.updateItem(user.id, f.variant.id, 2),
        remove: () => app.cart.removeItem(user.id, f.variant.id),
        'add-existing': () => app.cart.addItem(user.id, { variantId: f.variant.id, quantity: 1 }),
        'add-new': () => app.cart.addItem(user.id, { variantId: other.variant.id, quantity: 1 }),
        clear: () => app.cart.clearCart(user.id),
        merge: () => app.cart.mergeItems(user.id, [{ variantId: f.variant.id, quantity: 1 }]),
      };
      const gate = deferred();
      let modified = false;
      let finished = false;
      let orderPromise;
      const mutation = mutate(user, actions[operation], { after: async (event) => {
        if (event.model === 'CartItem' && ['update', 'create', 'delete', 'deleteMany'].includes(event.operation)) {
          modified = true;
          await gate.promise;
        }
      } });
      try {
        await until(() => modified, 'cart mutation writes');
        orderPromise = checkout(user).finally(() => { finished = true; });
        await until(async () => {
          const blocked = await observer.query(`SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`);
          return finished || blocked.rows[0].n > 0;
        }, 'checkout waits for the cart writer');
        assert.equal(finished, false, 'checkout must wait for the in-progress cart mutation');
      } finally {
        gate.resolve();
        await mutation;
        if (orderPromise) await orderPromise;
      }
      expectStatus(await mutation, 200);
      const order = await orderPromise;
      const s = await state(f);
      if (operation === 'remove' || operation === 'clear') {
        expectStatus(order, 400); assert.equal(s.orders.length, 0); assert.equal(s.inventory, 10);
      } else {
        expectStatus(order, 201);
        if (operation === 'add-new') {
          assert.equal(s.orders[0].items.length, 2);
          assert.equal(s.orders[0].items.find((i) => i.variantId === other.variant.id).quantity, 1);
        } else {
          assert.equal(s.orders[0].items[0].quantity, 2);
          assert.equal(s.inventory, 8);
        }
      }
      assert.equal(s.carts.filter((line) => line.cartId === user.cartId).length, 0);
    });
  }

  for (const stage of ['before-order', 'after-order', 'after-cart-clear']) await test(`rollback ${stage}`, async () => {
    const f = await fixture();
    const before = await state(f);
    let injected = false;
    const hook = async ({ model, operation }) => {
      if (stage === 'after-cart-clear'
        ? model === 'CartItem' && operation === 'deleteMany'
        : model === 'Order' && operation === 'create') {
        injected = true;
        throw new Error(`TEST ONLY failure ${stage}`);
      }
    };
    const result = await checkout(f.users[0], input(), {
      [stage === 'before-order' ? 'before' : 'after']: hook,
    });
    expectStatus(result, 500); assert.ok(injected);
    assert.deepEqual(await state(f), before);
  });

  await test('stock failure on second variant rolls back the first decrement', async () => {
    const first = await fixture(2);
    const second = await fixture(0);
    await db.cartItem.create({ data: {
      cartId: first.users[0].cartId, productId: second.product.id, variantId: second.variant.id, quantity: 1,
    } });
    const beforeFirst = await state(first);
    const beforeSecond = await state(second);
    expectStatus(await checkout(first.users[0]), 409);
    assert.deepEqual(await state(first), beforeFirst);
    assert.deepEqual(await state(second), beforeSecond);
  });

  await test('missing inventory record returns 409 without partial writes', async () => {
    const f = await fixture();
    const variant = await db.productVariant.create({ data: {
      sku: `TEST-NO-INVENTORY-${randomUUID()}`, price: '1.00', productId: f.product.id,
    } });
    await db.cartItem.create({ data: {
      cartId: f.users[0].cartId, productId: f.product.id, variantId: variant.id, quantity: 1,
    } });
    const before = await state(f);
    expectStatus(await checkout(f.users[0]), 409);
    assert.deepEqual(await state(f), before);
  });

  for (const sameKey of [true, false]) await test(`eight simultaneous requests, ${sameKey ? 'same' : 'different'} keys`, async () => {
    const f = await fixture(20);
    const body = input();
    const responses = await Promise.all(Array.from({ length: 8 }, () => checkout(f.users[0], sameKey ? body : input())));
    assert.equal(responses.filter((r) => r.status === 201).length, sameKey ? 8 : 1);
    if (sameKey) assert.equal(new Set(responses.map((r) => r.body.order.id)).size, 1);
    else assert.equal(responses.filter((r) => r.status === 400).length, 7);
    const s = await state(f);
    assert.equal(s.orders.length, 1); assert.equal(s.payments, 1); assert.equal(s.inventory, 19);
  });

  await test('opposite insertion order of shared variants does not deadlock', async () => {
    const f = await fixture(10);
    const other = await fixture(10);
    // User A already has the first variant; add the second. User B uses a fresh
    // cart where those same variants are inserted in the opposite order.
    await app.cart.addItem(f.users[0].id, { variantId: other.variant.id, quantity: 1 });
    const user = await db.user.create({ data: { id: randomUUID(), email: `${randomUUID()}@example.invalid` } });
    await app.cart.addItem(user.id, { variantId: other.variant.id, quantity: 1 });
    await app.cart.addItem(user.id, { variantId: f.variant.id, quantity: 1 });
    const responses = await Promise.all([checkout(f.users[0]), checkout(user)]);
    assert.deepEqual(statuses(responses), [201, 201]);
    assert.equal((await state(f)).inventory, 8);
    assert.equal((await state(other)).inventory, 8);
  });

  await test('simultaneous cart additions do not lose quantity updates', async () => {
    const f = await fixture(20);
    const responses = await Promise.all(Array.from({ length: 6 }, () => mutate(f.users[0],
      () => app.cart.addItem(f.users[0].id, { variantId: f.variant.id, quantity: 1 }))));
    assert.ok(responses.every((r) => r.status === 200));
    const s = await state(f);
    assert.equal(s.carts.find((line) => line.cartId === f.users[0].cartId).quantity, 7);
    assert.equal(s.inventory, 20);
  });

  for (const scenario of ['excess', 'zero-stock', 'inactive', 'empty', 'zero-quantity', 'negative-quantity']) {
    await test(`invalid cart: ${scenario}`, async () => {
      const f = await fixture(scenario === 'zero-stock' ? 0 : 1, scenario === 'empty' ? 0 : 2);
      if (scenario === 'inactive') await db.product.update({ where: { id: f.product.id }, data: { isActive: false } });
      if (scenario.endsWith('quantity')) await db.cartItem.update({
        where: { cartId_variantId: { cartId: f.users[0].cartId, variantId: f.variant.id } },
        data: { quantity: scenario === 'zero-quantity' ? 0 : -1 },
      });
      const before = await state(f);
      const result = await checkout(f.users[0]);
      expectStatus(result, scenario === 'empty' || scenario.endsWith('quantity') ? 400 : 409);
      assert.equal(result.body.ok, false);
      assert.deepEqual(await state(f), before);
    });
  }

  await test('missing variant is rejected by cart API and database foreign key', async () => {
    const f = await fixture();
    const before = await state(f);
    const result = await mutate(f.users[0], () => app.cart.addItem(f.users[0].id, { variantId: randomUUID(), quantity: 1 }));
    expectStatus(result, 404);
    await assert.rejects(db.cartItem.create({ data: {
      cartId: f.users[0].cartId, productId: f.product.id, variantId: randomUUID(), quantity: 1,
    } }), (error) => error.code === 'P2003');
    assert.deepEqual(await state(f), before);
  });

  await test('cross-user replay leaks no order and consumes no stock/cart', async () => {
    const f = await fixture();
    const body = input();
    expectStatus(await checkout(f.users[0], body), 201);
    const before = await state(f);
    const result = await checkout(f.users[1], body);
    expectStatus(result, 409);
    assert.deepEqual(result.body, { ok: false, message: 'Invalid idempotency key' });
    assert.deepEqual(await state(f), before);
  });

  await test('cross-user simultaneous key reuse', async () => {
    const f = await fixture();
    const body = input();
    const responses = await overlap(f.users[0], body, () => checkout(f.users[1], body));
    assert.deepEqual(statuses(responses), [201, 409]);
    assert.deepEqual(responses.find((r) => r.status === 409).body, { ok: false, message: 'Invalid idempotency key' });
    const s = await state(f);
    assert.equal(s.orders.length, 1); assert.equal(s.payments, 1); assert.equal(s.inventory, 9);
  });

  for (const [price, quantity, fee] of [['0.10', 3, '80.00'], ['299.99', 2, '80.00'], ['300.00', 2, '0.00']]) {
    await test(`authoritative Decimal totals: ${price} x ${quantity}`, async () => {
      const f = await fixture(10, quantity, price);
      const result = await checkout(f.users[0], input(undefined, {
        fulfilmentType: 'DELIVERY', shippingAddressLine1: 'TEST address', shippingCity: 'TEST city',
        shippingProvince: 'Limpopo', shippingPostalCode: '0000', shippingCountry: 'South Africa',
        total: '0.00', subtotal: '0.00', shippingFee: '0.00', price: 0,
        status: 'DELIVERED', paymentStatus: 'PAID', userId: f.users[1].id,
      }));
      expectStatus(result, 201);
      const expected = new Prisma.Decimal(price).mul(quantity);
      assert.equal(result.body.order.subtotal, expected.toFixed(2));
      assert.equal(result.body.order.shippingFee, fee);
      assert.equal(result.body.order.total, expected.add(fee).toFixed(2));
      const s = await state(f);
      assert.equal(s.orders[0].userId, f.users[0].id);
      assert.equal(s.orders[0].paymentStatus, 'PENDING');
      assert.equal(s.orders[0].status, 'PENDING');
      assert.equal(s.orders[0].payment.status, 'PENDING');
      assert.equal(s.orders[0].payment.provider, 'YOCO');
      assert.equal(s.orders[0].payment.amount.toFixed(2), result.body.order.total);
      assert.equal(s.orders[0].inventoryReleasedAt, null);
    });
  }

  await test('order item snapshots the actual SKU', async () => {
    const f = await fixture();
    expectStatus(await checkout(f.users[0]), 201);
    const s = await state(f);
    assert.equal(s.orders[0].items[0].sku, f.variant.sku);
    assert.equal(s.orders[0].items[0].size, f.variant.size);
    assert.equal(s.orders[0].items[0].color, f.variant.color);
  });

  await test('unauthenticated route returns 401', async () => {
    expectStatus(await checkout(null), 401);
  });
}

async function main() {
  mkdirSync(cache, { recursive: true });
  const runDir = mkdtempSync(path.join(cache, 'run-'));
  const dataDir = path.join(runDir, 'data');
  const port = await unusedPort();
  // All connection parameters are constructed here. No environment database URL is read.
  const connection = { host: '127.0.0.1', port, user: 'phase5', database: 'postgres', ssl: false };
  let started = false;
  let client;
  try {
    command(executable('initdb'), ['-D', dataDir, '-U', 'phase5', '-A', 'trust', '--encoding=UTF8', '--no-locale']);
    command(executable('pg_ctl'), ['-D', dataDir, '-l', path.join(runDir, 'postgres.log'),
      '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    observer = new Pool(connection);
    const ddl = command(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'),
      'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script']);
    assert.ok(!/^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im.test(ddl), 'Only additive DDL is allowed in the empty local cluster');
    // Prisma config can print a dotenv notice before the SQL output.
    await observer.query(ddl.slice(ddl.indexOf('-- Create')));
    client = new PrismaClient({ adapter: new PrismaPg(connection) });
    db = client;
    const instrumented = client.$extends({ query: { $allModels: { async $allOperations(event) {
      await context.getStore()?.before?.(event);
      const result = await event.query(event.args);
      await context.getStore()?.after?.({ ...event, result });
      return result;
    } } } });
    app = await loadApplication(instrumented);
    console.log(`Isolated PostgreSQL: 127.0.0.1:${port}; data: ${dataDir}`);
    await suite();
  } finally {
    if (client) await client.$disconnect();
    if (observer) await observer.end();
    if (started) command(executable('pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
    const report = { timestamp: new Date().toISOString(), results,
      passed: results.filter((r) => r.passed).length, failed: results.filter((r) => !r.passed).length,
      isolation: 'Fresh local PostgreSQL cluster; production URLs never used; server stopped; fixture records retained locally.',
    };
    writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(report, null, 2));
    console.log(`Results: ${report.passed} passed, ${report.failed} failed; ${path.join(runDir, 'results.json')}`);
  }
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
