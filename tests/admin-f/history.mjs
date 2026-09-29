import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { bundle, root } from "../admin-a/support/bundle.mjs";
import { database } from "../admin-b1/support/database.mjs";

const context = new AsyncLocalStorage();
const source = (file) => readFileSync(`${root}/${file}`, "utf8");
const purchasedAt = new Date("2026-10-02T12:00:00.000Z");
const afterPurchase = new Date("2026-10-05T12:00:00.000Z");
let handle, db, app, admin;

function checkoutInput(idempotencyKey, overrides = {}) {
  return {
    idempotencyKey,
    fulfilmentType: "PICKUP",
    customerName: "F7 Historical Customer",
    customerEmail: "f7-history@example.invalid",
    pickupLocation: "F7 historical pickup",
    ...overrides,
  };
}

async function fixture({
  price = "1499.99",
  salePrice = "1199.95",
  saleStartsAt = null,
  saleEndsAt = null,
  quantity = 2,
  stock = 10,
} = {}) {
  const suffix = randomUUID();
  const category = await db.category.create({
    data: { name: `F7 ${suffix}`, slug: `f7-${suffix}` },
  });
  const user = await db.user.create({
    data: { id: randomUUID(), email: `f7-${suffix}@example.invalid` },
  });
  const cart = await db.cart.create({ data: { userId: user.id } });
  const product = await db.product.create({
    data: {
      name: "F7 Purchase Title",
      slug: `f7-product-${suffix}`,
      categoryId: category.id,
      images: { create: { url: `/f7-${suffix}.jpg`, alt: "F7 snapshot image", position: 0 } },
    },
  });
  const variant = await db.productVariant.create({
    data: {
      sku: `F7-${suffix}`,
      size: "Large",
      color: "Midnight",
      price,
      salePrice,
      saleStartsAt,
      saleEndsAt,
      productId: product.id,
      inventory: { create: { quantity: stock } },
    },
  });
  await db.cartItem.create({
    data: { cartId: cart.id, productId: product.id, variantId: variant.id, quantity },
  });
  return { user, cart, product, variant, quantity, stock };
}

async function checkout(f, key = randomUUID(), pricingNow = () => purchasedAt) {
  const result = await app.createOrder(f.user.id, checkoutInput(key), pricingNow);
  const order = await db.order.findUniqueOrThrow({ where: { idempotencyKey: key } });
  return { result, order, key };
}

async function monetarySnapshot(orderId) {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      subtotal: true,
      shippingFee: true,
      total: true,
      items: {
        orderBy: { id: "asc" },
        select: {
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          title: true,
          sku: true,
          size: true,
          color: true,
          imageUrl: true,
          productId: true,
          variantId: true,
        },
      },
      payment: { select: { amount: true } },
    },
  });
  return {
    subtotal: order.subtotal.toFixed(2),
    shippingFee: order.shippingFee.toFixed(2),
    total: order.total.toFixed(2),
    paymentAmount: order.payment?.amount.toFixed(2) ?? null,
    items: order.items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
    })),
  };
}

function assertSalePurchase(snapshot) {
  assert.equal(snapshot.items[0].unitPrice, "1199.95");
  assert.equal(snapshot.items[0].lineTotal, "2399.90");
  assert.equal(snapshot.subtotal, "2399.90");
  assert.equal(snapshot.shippingFee, "0.00");
  assert.equal(snapshot.total, "2399.90");
  assert.equal(snapshot.paymentAmount, "2399.90");
}

function paymentEvent(checkoutId, amount, transactionId = `f7-payment-${randomUUID()}`) {
  return {
    id: `f7-event-${randomUUID()}`,
    type: "payment.succeeded",
    payload: {
      id: transactionId,
      type: "payment",
      status: "succeeded",
      amount,
      currency: "ZAR",
      metadata: { checkoutId },
    },
  };
}

before(async () => {
  handle = await database();
  db = handle.db;
  globalThis.__adminF7 = { db, context, yocoCalls: [] };
  app = await bundle(`
    export { createOrder } from './lib/checkout/service';
    export { resolveVariantPrice } from './lib/pricing/resolve-variant-price';
    export { getAdminOrder } from './lib/admin/orders/queries';
    export { getCustomerOrderForCurrentUser } from './lib/account/orders/query';
    export { prepareOrderPayment } from './lib/payments/prepare-order-payment';
    export { processYocoWebhook } from './lib/payments/process-yoco-webhook';
    export { expireUnpaidOrderCandidate } from './lib/orders/expire-unpaid-orders';
    export { transitionAdminOrder } from './lib/admin/orders/mutations';
    export { formatMoney as formatAdminMoney } from './components/admin/orders/order-ui';
    export { formatMoney as formatCustomerMoney } from './components/account/orders/order-ui';
  `, {
    "server-only": "",
    "@/lib/prisma": "export const prisma = globalThis.__adminF7.db;",
    "@/lib/auth/require-user": `export class AuthError extends Error {
      constructor(message, status) { super(message); this.status = status; }
    }
    export async function requireUser() {
      const user = globalThis.__adminF7.context.getStore()?.user;
      if (!user) throw new AuthError('Authentication required', 401);
      return user;
    }`,
    "@/lib/auth/require-admin": `export async function requireAdmin() {
      const user = globalThis.__adminF7.context.getStore()?.user;
      if (!user || user.role !== 'ADMIN') throw new Error('Admin required');
      return user;
    }`,
    "@/lib/payments/yoco": `export function decimalToCents(amount) {
      const [whole, fraction] = amount.toFixed(2).split('.');
      return Number(whole) * 100 + Number(fraction);
    }
    export async function createYocoCheckout(input) {
      const calls = globalThis.__adminF7.yocoCalls;
      const checkoutId = 'f7-checkout-' + (calls.length + 1) + '-' + Date.now();
      calls.push({ ...input, amount: input.amount.toFixed(2), checkoutId });
      return { checkoutId, redirectUrl: 'https://payments.example/' + checkoutId };
    }`,
  });
  admin = await db.user.create({
    data: { id: randomUUID(), email: `f7-admin-${randomUUID()}@example.invalid`, role: "ADMIN" },
  });
});

after(async () => {
  delete globalThis.__adminF7;
  await handle?.close();
});

test("active-sale checkout stores exact Decimal purchase-time money", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  assertSalePurchase(await monetarySnapshot(order.id));
});

test("sale expiry changes live resolution but leaves historical money unchanged", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  const before = await monetarySnapshot(order.id);
  await db.productVariant.update({
    where: { id: f.variant.id },
    data: { saleEndsAt: new Date("2026-10-04T00:00:00.000Z") },
  });
  const live = await db.productVariant.findUniqueOrThrow({ where: { id: f.variant.id } });
  assert.equal(app.resolveVariantPrice(live, afterPurchase).effectivePrice.toFixed(2), "1499.99");
  assert.deepEqual(await monetarySnapshot(order.id), before);
});

test("sale removal leaves historical money unchanged", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  const before = await monetarySnapshot(order.id);
  await db.productVariant.update({
    where: { id: f.variant.id },
    data: { salePrice: null, saleStartsAt: null, saleEndsAt: null },
  });
  assert.deepEqual(await monetarySnapshot(order.id), before);
});

test("later sale-price changes do not reprice the old order", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  const before = await monetarySnapshot(order.id);
  await db.productVariant.update({ where: { id: f.variant.id }, data: { salePrice: "999.95" } });
  const live = await db.productVariant.findUniqueOrThrow({ where: { id: f.variant.id } });
  assert.equal(app.resolveVariantPrice(live, afterPurchase).effectivePrice.toFixed(2), "999.95");
  assert.deepEqual(await monetarySnapshot(order.id), before);
});

test("later base-price changes do not reprice the old order", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  const before = await monetarySnapshot(order.id);
  await db.productVariant.update({
    where: { id: f.variant.id },
    data: { price: "1800.00", salePrice: null, saleStartsAt: null, saleEndsAt: null },
  });
  const live = await db.productVariant.findUniqueOrThrow({ where: { id: f.variant.id } });
  assert.equal(app.resolveVariantPrice(live, afterPurchase).effectivePrice.toFixed(2), "1800.00");
  assert.deepEqual(await monetarySnapshot(order.id), before);
});

test("a sale that starts after purchase does not discount the old order", async () => {
  const f = await fixture({ salePrice: null });
  const { order } = await checkout(f);
  const before = await monetarySnapshot(order.id);
  assert.equal(before.items[0].unitPrice, "1499.99");
  await db.productVariant.update({
    where: { id: f.variant.id },
    data: { salePrice: "999.95", saleStartsAt: new Date("2026-10-03T00:00:00.000Z") },
  });
  const live = await db.productVariant.findUniqueOrThrow({ where: { id: f.variant.id } });
  assert.equal(app.resolveVariantPrice(live, afterPurchase).effectivePrice.toFixed(2), "999.95");
  assert.deepEqual(await monetarySnapshot(order.id), before);
});

test("same-key retry after repricing returns the original order without stock or payment duplication", async () => {
  const f = await fixture();
  const key = `F7-IDEMPOTENCY-${randomUUID()}`;
  let clockCalls = 0;
  const pricingNow = () => { clockCalls += 1; return purchasedAt; };
  const first = await checkout(f, key, pricingNow);
  const before = await monetarySnapshot(first.order.id);
  const reservedStock = (await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity;
  await db.productVariant.update({
    where: { id: f.variant.id },
    data: { price: "1800.00", salePrice: "999.95" },
  });
  const replay = await app.createOrder(f.user.id, checkoutInput(key), pricingNow);
  assert.deepEqual(replay, first.result);
  assert.equal(clockCalls, 1);
  assert.equal(await db.order.count({ where: { idempotencyKey: key } }), 1);
  assert.equal(await db.payment.count({ where: { orderId: first.order.id } }), 1);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity, reservedStock);
  assert.equal(await db.cartItem.count({ where: { cartId: f.cart.id } }), 0);
  assert.deepEqual(await monetarySnapshot(first.order.id), before);
});

test("admin order detail reads stored item and order snapshots after catalogue edits", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  await db.product.update({ where: { id: f.product.id }, data: { name: "Renamed live product" } });
  await db.productVariant.update({
    where: { id: f.variant.id },
    data: { sku: `RENAMED-${randomUUID()}`, size: "Small", color: "Live colour", price: "1800.00", salePrice: null },
  });
  const detail = await context.run({ user: admin }, () => app.getAdminOrder(order.id));
  assert.equal(detail.subtotal, "2399.90");
  assert.equal(detail.total, "2399.90");
  assert.equal(detail.payment.amount, "2399.90");
  assert.deepEqual(
    (({ title, sku, size, color, imageUrl, unitPrice, lineTotal }) => ({ title, sku, size, color, imageUrl, unitPrice, lineTotal }))(detail.items[0]),
    { title: "F7 Purchase Title", sku: f.variant.sku, size: "Large", color: "Midnight", imageUrl: `/f7-${f.product.slug.slice("f7-product-".length)}.jpg`, unitPrice: "1199.95", lineTotal: "2399.90" },
  );
});

test("customer detail and account-list source remain stored-snapshot based after repricing", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  await db.productVariant.update({
    where: { id: f.variant.id },
    data: { price: "1800.00", salePrice: "999.95" },
  });
  const detail = await context.run({ user: f.user }, () => app.getCustomerOrderForCurrentUser(order.id));
  assert.equal(detail.subtotal, "2399.90");
  assert.equal(detail.total, "2399.90");
  assert.equal(detail.items[0].unitPrice, "1199.95");
  assert.equal(detail.items[0].lineTotal, "2399.90");
  const accountPage = source("app/account/page.tsx");
  const orderList = accountPage.match(/prisma\.order\.findMany\([\s\S]*?\n    \}\),/)?.[0] ?? "";
  assert.match(orderList, /total: true/);
  assert.doesNotMatch(orderList, /ProductVariant|variant|unitPrice|salePrice|resolveVariantPrice/);
});

test("payment preparation sends the stored order total after live repricing", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  const before = await monetarySnapshot(order.id);
  await db.productVariant.update({ where: { id: f.variant.id }, data: { price: "1800.00", salePrice: "999.95" } });
  globalThis.__adminF7.yocoCalls.length = 0;
  await app.prepareOrderPayment(f.user.id, order.id, {
    successUrl: "https://shop.example/success",
    cancelUrl: "https://shop.example/cancel",
    failureUrl: "https://shop.example/failure",
  });
  assert.equal(globalThis.__adminF7.yocoCalls.length, 1);
  assert.equal(globalThis.__adminF7.yocoCalls[0].amount, "2399.90");
  assert.deepEqual(await monetarySnapshot(order.id), before);
});

test("webhook verification uses stored amounts after repricing and still rejects a mismatch", async () => {
  const accepted = await fixture();
  const acceptedOrder = (await checkout(accepted)).order;
  await db.payment.update({ where: { orderId: acceptedOrder.id }, data: { providerCheckoutId: `f7-webhook-${randomUUID()}` } });
  await db.productVariant.update({ where: { id: accepted.variant.id }, data: { price: "1800.00", salePrice: "999.95" } });
  const acceptedPayment = await db.payment.findUniqueOrThrow({ where: { orderId: acceptedOrder.id } });
  assert.equal(await app.processYocoWebhook(paymentEvent(acceptedPayment.providerCheckoutId, 239990)), "processed");
  assertSalePurchase(await monetarySnapshot(acceptedOrder.id));

  const rejected = await fixture();
  const rejectedOrder = (await checkout(rejected)).order;
  await db.payment.update({ where: { orderId: rejectedOrder.id }, data: { providerCheckoutId: `f7-webhook-${randomUUID()}` } });
  await db.productVariant.update({ where: { id: rejected.variant.id }, data: { price: "1800.00", salePrice: "999.95" } });
  const rejectedPayment = await db.payment.findUniqueOrThrow({ where: { orderId: rejectedOrder.id } });
  await assert.rejects(
    () => app.processYocoWebhook(paymentEvent(rejectedPayment.providerCheckoutId, 239991)),
    (error) => error?.status === 409,
  );
  const pending = await db.order.findUniqueOrThrow({ where: { id: rejectedOrder.id }, include: { payment: true } });
  assert.equal(pending.status, "PENDING");
  assert.equal(pending.payment.status, "PENDING");
  assertSalePurchase(await monetarySnapshot(rejectedOrder.id));
});

test("unpaid-order expiry restores stock without changing any historical monetary value", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  const before = await monetarySnapshot(order.id);
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity, 8);
  const expiredAt = new Date("2026-10-10T12:00:00.000Z");
  assert.equal(await app.expireUnpaidOrderCandidate(order.id, expiredAt, expiredAt), "expired");
  assert.equal((await db.inventory.findUniqueOrThrow({ where: { variantId: f.variant.id } })).quantity, 10);
  const expired = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
  assert.equal(expired.status, "CANCELLED");
  assert.equal(expired.payment.status, "FAILED");
  assert.deepEqual(await monetarySnapshot(order.id), before);
});

test("fulfilment mutation changes workflow state without changing historical money", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  const checkoutId = `f7-fulfilment-${randomUUID()}`;
  await db.payment.update({ where: { orderId: order.id }, data: { providerCheckoutId: checkoutId } });
  assert.equal(await app.processYocoWebhook(paymentEvent(checkoutId, 239990)), "processed");
  const before = await monetarySnapshot(order.id);
  const updated = await context.run({ user: admin }, () => app.transitionAdminOrder(order.id, {
    expectedStatus: "CONFIRMED",
    targetStatus: "PROCESSING",
  }));
  assert.equal(updated.status, "PROCESSING");
  assert.deepEqual(await monetarySnapshot(order.id), before);
});

test("historical serializers and formatters preserve fractional-rand cents", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  const adminDetail = await context.run({ user: admin }, () => app.getAdminOrder(order.id));
  const customerDetail = await context.run({ user: f.user }, () => app.getCustomerOrderForCurrentUser(order.id));
  assert.equal(adminDetail.items[0].unitPrice, "1199.95");
  assert.equal(adminDetail.items[0].lineTotal, "2399.90");
  assert.equal(customerDetail.items[0].unitPrice, "1199.95");
  assert.equal(customerDetail.items[0].lineTotal, "2399.90");
  assert.match(app.formatAdminMoney("1199.95"), /95/);
  assert.match(app.formatCustomerMoney("2399.90"), /90/);
});

test("SET NULL catalogue relation loss preserves every OrderItem snapshot", async () => {
  const f = await fixture();
  const { order } = await checkout(f);
  const before = await monetarySnapshot(order.id);
  const constraints = await handle.pool.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conname IN ('OrderItem_productId_fkey', 'OrderItem_variantId_fkey')
    ORDER BY conname`);
  assert.equal(constraints.rows.length, 2);
  for (const constraint of constraints.rows) assert.match(constraint.definition, /ON DELETE SET NULL/);
  await db.product.delete({ where: { id: f.product.id } });
  const afterSnapshot = await monetarySnapshot(order.id);
  const withoutRelationIds = (item) => {
    const snapshot = { ...item };
    delete snapshot.productId;
    delete snapshot.variantId;
    return snapshot;
  };
  assert.deepEqual(
    afterSnapshot.items.map(withoutRelationIds),
    before.items.map(withoutRelationIds),
  );
  assert.equal(afterSnapshot.items[0].productId, null);
  assert.equal(afterSnapshot.items[0].variantId, null);
  assert.equal(afterSnapshot.subtotal, before.subtotal);
  assert.equal(afterSnapshot.total, before.total);
  assert.equal(afterSnapshot.paymentAmount, before.paymentAmount);
});

test("historical monetary paths have precise static guards against live repricing", () => {
  const historicalPaths = [
    "lib/admin/orders/queries.ts",
    "lib/admin/orders/serialize.ts",
    "lib/admin/orders/mutations.ts",
    "lib/account/orders/query.ts",
    "app/account/page.tsx",
    "app/api/orders/[orderId]/payment-status/route.ts",
    "lib/payments/prepare-order-payment.ts",
    "lib/payments/process-yoco-webhook.ts",
    "lib/orders/expire-unpaid-orders.ts",
  ];
  for (const file of historicalPaths) {
    const contents = source(file);
    assert.doesNotMatch(contents, /resolveVariantPrice|salePrice|saleStartsAt|saleEndsAt/, file);
    assert.doesNotMatch(contents, /ProductVariant\.price|variant\.price/, file);
  }
  assert.doesNotMatch(source("lib/admin/orders/serialize.ts"), /variant:\s*\{|product:\s*\{/);
  assert.doesNotMatch(source("lib/account/orders/query.ts"), /variant:\s*\{|product:\s*\{/);
  for (const file of ["lib/payments/prepare-order-payment.ts", "lib/payments/process-yoco-webhook.ts"]) {
    assert.doesNotMatch(source(file), /productVariant|ProductVariant|order\.items|items:\s*\{/i, file);
  }
});
