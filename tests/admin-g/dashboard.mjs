import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";
import { database } from "../admin-b1/support/database.mjs";

const context = new AsyncLocalStorage();
const REPORTING_AT = new Date("2026-10-18T12:30:00.000Z");
let handle, db, pool, app, admin, customer;
const as = (user, action) => context.run({ user }, action);
const asAdmin = (action) => as(admin, action);
const dashboard = (at = REPORTING_AT) => asAdmin(() => app.getAdminDashboardData(at));

before(async () => {
  handle = await database();
  ({ db, pool } = handle);
  await db.order.deleteMany(); // Only the disposable loopback fixture database.
  admin = await db.user.create({ data: { id: randomUUID(), email: "admin-g@example.invalid", role: "ADMIN" } });
  customer = await db.user.create({ data: { id: randomUUID(), email: "customer-g@example.invalid", role: "CUSTOMER" } });
  globalThis.__adminG = { db, context };
  app = await bundle(`
    export * from './lib/admin/dashboard/queries';
    export * from './lib/pricing/resolve-variant-price';
  `, {
    "server-only": "",
    "@/lib/prisma": "export const prisma = globalThis.__adminG.db;",
    "@/lib/supabase/server": `export const createClient = async () => ({ auth: { getUser: async () => ({
      data: { user: globalThis.__adminG.context.getStore()?.user ?? null }, error: null,
    }) } });`,
  });
});

after(async () => {
  delete globalThis.__adminG;
  await handle?.close();
});

async function reset() {
  await db.order.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
}

async function order(options = {}) {
  const id = options.id ?? randomUUID();
  const total = options.total ?? "100.00";
  const confirmedAt = Object.hasOwn(options, "confirmedAt") ? options.confirmedAt : new Date("2026-10-05T10:00:00.000Z");
  const payment = options.payment === false ? undefined : { create: {
    amount: options.paymentAmount ?? total,
    status: options.paymentRecordStatus ?? "PAID",
    provider: options.provider ?? "YOCO",
  } };
  return db.order.create({ data: {
    id,
    orderNumber: `DGN-G-${id}`,
    idempotencyKey: `idem-g-${id}`,
    status: options.status ?? "CONFIRMED",
    paymentStatus: options.paymentStatus ?? "PAID",
    fulfilmentType: options.fulfilmentType ?? "DELIVERY",
    subtotal: total,
    shippingFee: "0.00",
    total,
    customerName: options.customerName ?? "Snapshot customer",
    customerEmail: "snapshot@example.invalid",
    userId: customer.id,
    confirmedAt,
    cancelledAt: options.cancelledAt ?? null,
    inventoryReleasedAt: options.inventoryReleasedAt ?? null,
    createdAt: options.createdAt ?? new Date("2026-10-02T10:00:00.000Z"),
    ...(payment ? { payment } : {}),
    ...(options.items ? { items: { create: options.items.map((item) => ({
      quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal,
      title: item.title, sku: item.sku,
      productId: item.productId ?? null, variantId: item.variantId ?? null,
    })) } } : {}),
  } });
}

async function variant(options = {}) {
  const id = randomUUID();
  const category = await db.category.create({ data: { name: `Category ${id}`, slug: `category-${id}` } });
  const product = await db.product.create({ data: {
    name: `Product ${id}`, slug: `product-${id}`, categoryId: category.id,
    isActive: options.active ?? true,
  } });
  const row = await db.productVariant.create({ data: {
    productId: product.id,
    sku: options.sku ?? `SKU-${id}`,
    price: "100.00",
    salePrice: options.salePrice ?? null,
    saleStartsAt: options.saleStartsAt ?? null,
    saleEndsAt: options.saleEndsAt ?? null,
    ...(options.quantity === null ? {} : { inventory: { create: { quantity: options.quantity ?? 0 } } }),
  } });
  return { category, product, variant: row };
}

test("real admin authorization rejects anonymous and CUSTOMER, allows ADMIN", async () => {
  await reset();
  await assert.rejects(as(null, () => app.getAdminDashboardData(REPORTING_AT)), { status: 401 });
  await assert.rejects(as(customer, () => app.getAdminDashboardData(REPORTING_AT)), { status: 403 });
  const result = await dashboard();
  assert.equal(result.reportingAt, REPORTING_AT.toISOString());
  assert.equal(result.revenue.current, "0.00");
  assert.equal(result.averageOrderValue.current, null);
});

test("one authoritative paid predicate rejects inconsistent, refunded and invalid orders", async () => {
  await reset();
  await order({ total: "0.10", provider: "OTHER" }); // Provider identifiers are not reporting authority.
  await order({ status: "PENDING" });
  await order({ status: "CANCELLED" });
  await order({ paymentStatus: "PENDING" });
  await order({ paymentStatus: "REFUNDED" });
  await order({ paymentRecordStatus: "PENDING" });
  await order({ paymentRecordStatus: "FAILED" });
  await order({ paymentRecordStatus: "REFUNDED" });
  await order({ paymentAmount: "99.99" });
  await order({ confirmedAt: null });
  await order({ cancelledAt: new Date("2026-10-06T00:00:00.000Z") });
  await order({ inventoryReleasedAt: new Date("2026-10-06T00:00:00.000Z") });
  await order({ payment: false });
  const result = await dashboard();
  assert.equal(result.revenue.current, "0.10");
  assert.equal(result.paidOrders.current, 1);
  assert.equal(result.fulfilment.awaitingTotal, 1);
  assert.equal(result.revenueTrend.at(-1).revenue, "0.10");
});

test("real PostgreSQL confirms Prisma UTC timestamp storage and half-open SAST boundaries", async () => {
  await reset();
  const first = await order({ total: "0.10", confirmedAt: new Date("2026-09-30T22:00:00.000Z") });
  await order({ total: "0.20", confirmedAt: new Date("2026-09-30T21:59:59.999Z") });
  await order({ total: "0.30", confirmedAt: new Date(REPORTING_AT) });
  const stored = await pool.query('SELECT "confirmedAt"::text AS value FROM "Order" WHERE id = $1', [first.id]);
  assert.equal(stored.rows[0].value, "2026-09-30 22:00:00");
  const prismaRead = await db.order.findUniqueOrThrow({ where: { id: first.id }, select: { confirmedAt: true } });
  assert.equal(prismaRead.confirmedAt.toISOString(), "2026-09-30T22:00:00.000Z");
  const result = await dashboard();
  assert.equal(result.revenue.current, "0.10");
  assert.equal(result.paidOrders.current, 1);
  assert.equal(result.revenue.previousComparable, "0.00");
});

test("previous comparable interval uses matching SAST time and excludes its endpoint", async () => {
  await reset();
  await order({ total: "12.00", confirmedAt: new Date("2026-08-31T22:00:00.000Z") });
  await order({ total: "5.00", confirmedAt: new Date("2026-09-18T12:29:59.999Z") });
  await order({ total: "99.00", confirmedAt: new Date("2026-09-18T12:30:00.000Z") });
  const result = await dashboard();
  assert.equal(result.revenue.previousComparable, "17.00");
  assert.equal(result.paidOrders.previousComparable, 2);
});

test("PostgreSQL numeric sums, AOV and comparisons retain cents", async () => {
  await reset();
  await order({ total: "0.10" });
  await order({ total: "0.20" });
  await order({ total: "0.02" });
  await order({ total: "0.10", confirmedAt: new Date("2026-09-02T10:00:00.000Z") });
  const result = await dashboard();
  assert.equal(result.revenue.current, "0.32");
  assert.equal(result.revenue.previousComparable, "0.10");
  assert.deepEqual(result.revenue.comparison, { direction: "UP", percentage: "220.0", absoluteDelta: "0.22" });
  assert.equal(result.averageOrderValue.current, "0.11");
  assert.equal(result.averageOrderValue.previousComparable, "0.10");
  assert.equal(result.paidOrders.current, 3);
  assert.equal(result.paidOrders.comparison.percentage, "200.0");
});

test("fulfilment counts only paid, actionable delivery and pickup states", async () => {
  await reset();
  for (const status of ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]) await order({ status, fulfilmentType: "DELIVERY" });
  for (const status of ["CONFIRMED", "PROCESSING", "READY_FOR_PICKUP", "DELIVERED"]) await order({ status, fulfilmentType: "PICKUP" });
  await order({ status: "SHIPPED", fulfilmentType: "PICKUP" });
  await order({ status: "READY_FOR_PICKUP", fulfilmentType: "DELIVERY" });
  await order({ status: "PENDING", paymentStatus: "PENDING" });
  await order({ status: "CONFIRMED", paymentRecordStatus: "FAILED" });
  const result = await dashboard();
  assert.deepEqual(result.fulfilment, { awaitingTotal: 6, confirmed: 2, processing: 2, shipped: 1, readyForPickup: 1 });
  assert.equal(result.paidOrders.current, 8);
});

test("impossible fulfilment branches do not affect authoritative financial or SKU metrics", async () => {
  await reset();
  await order({
    total: "111.11",
    status: "SHIPPED",
    fulfilmentType: "PICKUP",
    items: [{ sku: "IMPOSSIBLE-PICKUP", title: "Impossible pickup", quantity: 7, unitPrice: "10.00", lineTotal: "70.00" }],
  });
  await order({
    total: "222.22",
    status: "READY_FOR_PICKUP",
    fulfilmentType: "DELIVERY",
    items: [{ sku: "IMPOSSIBLE-DELIVERY", title: "Impossible delivery", quantity: 8, unitPrice: "20.00", lineTotal: "160.00" }],
  });
  await order({
    total: "30.30",
    status: "SHIPPED",
    fulfilmentType: "DELIVERY",
    items: [{ sku: "VALID-SKU", title: "Valid snapshot", quantity: 3, unitPrice: "10.00", lineTotal: "30.00" }],
  });

  const result = await dashboard();
  assert.equal(result.revenue.current, "30.30");
  assert.equal(result.paidOrders.current, 1);
  assert.deepEqual(result.revenueTrend.at(-1), { month: "2026-10", revenue: "30.30", paidOrders: 1 });
  assert.deepEqual(result.topSkus, [{ sku: "VALID-SKU", title: "Valid snapshot", unitsSold: 3, merchandiseRevenue: "30.00" }]);
});

test("inventory separates zero, low, missing and inactive variants", async () => {
  await reset();
  for (const quantity of [0, 1, 5, 6, null]) await variant({ quantity });
  await variant({ quantity: 0, active: false });
  await variant({ quantity: null, active: false });
  const result = await dashboard();
  assert.deepEqual(result.inventory, { outOfStock: 1, lowStock: 2, missingInventory: 1, lowStockThreshold: 5 });
});

test("active sale query agrees with the resolver at exact start and end instants", async () => {
  await reset();
  const start = new Date(REPORTING_AT);
  const end = new Date(REPORTING_AT);
  const rows = [
    await variant({ salePrice: null }),
    await variant({ salePrice: "80.00", saleStartsAt: new Date("2026-10-19T00:00:00.000Z") }),
    await variant({ salePrice: "80.00" }),
    await variant({ salePrice: "80.00", saleStartsAt: start }),
    await variant({ salePrice: "80.00", saleEndsAt: end }),
    await variant({ salePrice: "80.00", saleEndsAt: new Date("2026-10-17T00:00:00.000Z") }),
    await variant({ salePrice: "80.00", active: false }),
  ];
  const expected = rows.filter(({ product, variant }) => product.isActive
    && app.resolveVariantPrice(variant, REPORTING_AT).state === "ACTIVE").length;
  assert.equal(expected, 2);
  assert.equal((await dashboard()).sales.activeVariants, expected);
  assert.equal((await dashboard(new Date(REPORTING_AT.getTime() - 1))).sales.activeVariants, 2);
});

test("six-month trend is chronological, zero-filled, paid-only and current-month partial", async () => {
  await reset();
  await order({ total: "10.00", confirmedAt: new Date("2026-04-30T21:59:59.999Z") });
  await order({ total: "20.00", confirmedAt: new Date("2026-04-30T22:00:00.000Z") });
  await order({ total: "30.00", confirmedAt: new Date("2026-07-01T00:00:00.000Z") });
  await order({ total: "40.00", confirmedAt: new Date("2026-10-03T00:00:00.000Z") });
  await order({ total: "50.00", confirmedAt: new Date(REPORTING_AT) });
  await order({ total: "60.00", paymentRecordStatus: "REFUNDED" });
  const result = await dashboard();
  assert.deepEqual(result.revenueTrend, [
    { month: "2026-05", revenue: "20.00", paidOrders: 1 },
    { month: "2026-06", revenue: "0.00", paidOrders: 0 },
    { month: "2026-07", revenue: "30.00", paidOrders: 1 },
    { month: "2026-08", revenue: "0.00", paidOrders: 0 },
    { month: "2026-09", revenue: "0.00", paidOrders: 0 },
    { month: "2026-10", revenue: "40.00", paidOrders: 1 },
  ]);
});

test("recent orders return five deterministic, private operational snapshots including pending", async () => {
  await reset();
  const sameTime = new Date("2026-10-10T00:00:00.000Z");
  for (let n = 1; n <= 6; n++) await order({
    id: `recent-0${n}`, createdAt: sameTime, status: n === 6 ? "PENDING" : "CONFIRMED",
    paymentStatus: n === 6 ? "PENDING" : "PAID",
  });
  const result = await dashboard();
  assert.deepEqual(result.recentOrders.map((row) => row.id), ["recent-06", "recent-05", "recent-04", "recent-03", "recent-02"]);
  assert.equal(result.recentOrders[0].paymentStatus, "PENDING");
  assert.deepEqual(Object.keys(result.recentOrders[0]).sort(), [
    "createdAt", "customerName", "fulfilmentType", "id", "orderNumber", "paymentStatus", "status", "total",
  ]);
  assert.equal(result.recentOrders[0].total, "100.00");
});

test("top SKUs use immutable snapshots, aggregate exact values and pick latest historical title", async () => {
  await reset();
  const live = await variant({ sku: "HISTORY-SKU", quantity: 8 });
  await order({ confirmedAt: new Date("2026-06-01T00:00:00.000Z"), items: [{
    sku: "HISTORY-SKU", title: "Old snapshot title", quantity: 2,
    unitPrice: "0.10", lineTotal: "0.20", productId: live.product.id, variantId: live.variant.id,
  }] });
  await order({ confirmedAt: new Date("2026-10-01T00:00:00.000Z"), items: [{
    sku: "HISTORY-SKU", title: "Latest snapshot title", quantity: 3,
    unitPrice: "0.10", lineTotal: "0.30", productId: live.product.id, variantId: live.variant.id,
  }] });
  await order({ paymentRecordStatus: "REFUNDED", items: [{ sku: "HISTORY-SKU", title: "Excluded", quantity: 100, unitPrice: "1.00", lineTotal: "100.00" }] });
  await order({ confirmedAt: new Date("2026-04-30T21:59:59.999Z"), items: [{ sku: "HISTORY-SKU", title: "Too old", quantity: 100, unitPrice: "1.00", lineTotal: "100.00" }] });
  const first = await dashboard();
  assert.deepEqual(first.topSkus, [{ sku: "HISTORY-SKU", title: "Latest snapshot title", unitsSold: 5, merchandiseRevenue: "0.50" }]);
  await db.product.update({ where: { id: live.product.id }, data: { name: "Renamed live product" } });
  await db.productVariant.update({ where: { id: live.variant.id }, data: { price: "999.00" } });
  assert.deepEqual((await dashboard()).topSkus, first.topSkus);
  await db.product.delete({ where: { id: live.product.id } });
  assert.deepEqual((await dashboard()).topSkus, first.topSkus);
});

test("top SKU ranking is units-first, deterministic and capped at five", async () => {
  await reset();
  for (let n = 1; n <= 6; n++) await order({ items: [{
    sku: `RANK-${n}`, title: `Title ${n}`, quantity: n,
    unitPrice: "1.00", lineTotal: `${n}.00`,
  }] });
  assert.deepEqual((await dashboard()).topSkus.map((row) => row.sku), ["RANK-6", "RANK-5", "RANK-4", "RANK-3", "RANK-2"]);
});

test("dashboard reads leave orders, payments and inventory unchanged", async () => {
  await reset();
  const existing = await order();
  const stock = await variant({ quantity: 3, salePrice: "80.00" });
  const before = {
    order: await db.order.findUnique({ where: { id: existing.id }, include: { payment: true } }),
    inventory: await db.inventory.findUnique({ where: { variantId: stock.variant.id } }),
  };
  await dashboard();
  assert.deepEqual(await db.order.findUnique({ where: { id: existing.id }, include: { payment: true } }), before.order);
  assert.deepEqual(await db.inventory.findUnique({ where: { variantId: stock.variant.id } }), before.inventory);
});
