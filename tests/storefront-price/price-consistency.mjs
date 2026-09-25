import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";
import { database } from "../admin-b1/support/database.mjs";

const context = new AsyncLocalStorage();
const origin = "https://storefront-price.example.invalid";
const originalOrigin = process.env.APP_URL;
let handle, db, app, admin, customer, category;
const asAdmin = (action) => context.run({ user: admin }, action);

function productInput() {
  const suffix = randomUUID();
  return {
    name: `Storefront price ${suffix}`,
    slug: `storefront-price-${suffix}`,
    description: "Price consistency fixture",
    badge: null,
    details: [],
    categorySlug: category.slug,
    featured: true,
    isActive: true,
    images: [],
    variants: [
      { sku: `PRICE-A-${suffix}`, size: "A", color: "Black", price: "100.00" },
      { sku: `PRICE-B-${suffix}`, size: "B", color: "Black", price: "200.00" },
    ],
  };
}

async function fixture() {
  const product = await asAdmin(() => app.createAdminProduct(productInput()));
  const variantA = product.variants.find((variant) => variant.size === "A");
  const variantB = product.variants.find((variant) => variant.size === "B");
  await db.productVariant.update({ where: { id: variantA.id }, data: { createdAt: new Date("2026-01-01T00:00:00.000Z") } });
  await db.productVariant.update({ where: { id: variantB.id }, data: { createdAt: new Date("2026-01-02T00:00:00.000Z") } });
  return { product, variantA, variantB };
}

async function publicViews(product) {
  const listResponse = await app.listGET({ nextUrl: new URL(`${origin}/api/products?pageSize=50`) });
  const categoryResponse = await app.listGET({ nextUrl: new URL(`${origin}/api/products?category=${category.slug}&pageSize=50`) });
  const detailResponse = await app.detailGET(new Request(`${origin}/api/products/${product.slug}`), {
    params: Promise.resolve({ id: product.slug }),
  });
  assert.equal(listResponse.status, 200);
  assert.equal(categoryResponse.status, 200);
  assert.equal(detailResponse.status, 200);
  const list = (await listResponse.json()).products.find((item) => item.id === product.id);
  const filtered = (await categoryResponse.json()).products.find((item) => item.id === product.id);
  const detail = (await detailResponse.json()).product;
  return { list, filtered, detail };
}

function prices(product) {
  return product.variants.map(({ sku, price }) => [sku, price]);
}

before(async () => {
  handle = await database();
  db = handle.db;
  admin = await db.user.create({ data: { id: randomUUID(), email: "price-admin@example.invalid", role: "ADMIN" } });
  customer = await db.user.create({ data: { id: randomUUID(), email: "price-customer@example.invalid" } });
  category = await db.category.create({ data: { name: "Price tests", slug: `price-tests-${randomUUID()}` } });
  globalThis.__storefrontPrice = { db, context };
  app = await bundle(`
    export * from './lib/admin/products/mutations';
    export { GET as listGET } from './app/api/products/route';
    export { GET as detailGET } from './app/api/products/[id]/route';
    export { normalizeProduct } from './lib/products';
  `, {
    "server-only": "",
    "@/lib/prisma": "export const prisma = globalThis.__storefrontPrice.db;",
    "@/lib/supabase/server": `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__storefrontPrice.context.getStore()?.user ?? null }, error: null }) } });`,
    "next/headers": `export async function headers() { return new Headers({ host: 'storefront-price.example.invalid', 'x-forwarded-proto': 'https' }); }`,
  });
  process.env.APP_URL = origin;
});

after(async () => {
  if (originalOrigin === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalOrigin;
  delete globalThis.__storefrontPrice;
  await handle?.close();
});

test("public product endpoints return the same deterministic variant order and prices", async () => {
  const { product, variantA, variantB } = await fixture();
  const views = await publicViews(product);
  const expected = [[variantA.sku, 100], [variantB.sku, 200]];
  assert.deepEqual(prices(views.list), expected);
  assert.deepEqual(prices(views.filtered), expected);
  assert.deepEqual(prices(views.detail), expected);
  assert.equal(app.normalizeProduct(views.list).price, 100);
  assert.equal(app.normalizeProduct(views.filtered).price, 100);
  assert.equal(app.normalizeProduct(views.detail).price, 100);
});

test("Admin D price edits immediately reach APIs and every storefront adapter without changing stock or order snapshots", async () => {
  const { product, variantA, variantB } = await fixture();
  await db.inventory.update({ where: { variantId: variantA.id }, data: { quantity: 9 } });
  await db.inventory.update({ where: { variantId: variantB.id }, data: { quantity: 4 } });
  const order = await db.order.create({
    data: {
      orderNumber: `DGN-PRICE-${randomUUID()}`,
      idempotencyKey: randomUUID(),
      fulfilmentType: "PICKUP",
      subtotal: "100.00",
      shippingFee: "0.00",
      total: "100.00",
      customerName: "Historical snapshot",
      customerEmail: "snapshot@example.invalid",
      pickupLocation: "Snapshot pickup",
      userId: customer.id,
      items: { create: { productId: product.id, variantId: variantA.id, quantity: 1, unitPrice: "100.00", lineTotal: "100.00", title: product.name, sku: variantA.sku, size: variantA.size, color: variantA.color } },
    },
  });
  const inventoryBefore = await db.inventory.findMany({ where: { variantId: { in: [variantA.id, variantB.id] } }, orderBy: { variantId: "asc" } });
  const snapshotBefore = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

  const updated = await asAdmin(() => app.updateAdminProductVariant(product.id, variantA.id, {
    expectedUpdatedAt: product.updatedAt,
    sku: variantA.sku,
    size: variantA.size,
    color: variantA.color,
    price: "150.00",
  }));

  const raw = await db.productVariant.findMany({
    where: { productId: product.id },
    select: { sku: true, price: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  assert.deepEqual(raw.map((variant) => [variant.sku, variant.price.toFixed(2)]), [[variantA.sku, "150.00"], [variantB.sku, "200.00"]]);

  const views = await publicViews(product);
  const expected = [[variantA.sku, 150], [variantB.sku, 200]];
  for (const view of Object.values(views)) {
    assert.deepEqual(prices(view), expected);
    assert.equal(app.normalizeProduct(view).price, 150);
    assert.equal(app.normalizeProduct(view).variants.find((variant) => variant.sku === variantA.sku).price, 150);
  }

  await assert.rejects(() => asAdmin(() => app.updateAdminProductVariant(product.id, variantA.id, {
    expectedUpdatedAt: product.updatedAt,
    sku: variantA.sku,
    size: variantA.size,
    color: variantA.color,
    price: "175.00",
  })), { status: 409 });
  assert.equal((await db.productVariant.findUniqueOrThrow({ where: { id: variantA.id } })).price.toFixed(2), "150.00");
  assert.equal(updated.variants.find((variant) => variant.id === variantA.id).price, "150.00");
  assert.deepEqual(await db.inventory.findMany({ where: { variantId: { in: [variantA.id, variantB.id] } }, orderBy: { variantId: "asc" } }), inventoryBefore);
  assert.deepEqual(await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } }), snapshotBefore);
});

test("storefront card price is the lowest normal variant price regardless of incoming array order", () => {
  const base = {
    id: "product-price-order",
    slug: "product-price-order",
    name: "Price order",
    description: null,
    badge: null,
    details: [],
    featured: false,
    isActive: true,
    category: { id: "category-price", name: "Prices", slug: "prices" },
    images: [],
  };
  const expensive = { id: "variant-expensive", sku: "EXPENSIVE", size: "L", color: "Black", price: 200, inventory: { quantity: 1, inStock: true } };
  const affordable = { id: "variant-affordable", sku: "AFFORDABLE", size: "M", color: "Black", price: 100, inventory: { quantity: 1, inStock: true } };
  assert.equal(app.normalizeProduct({ ...base, variants: [expensive, affordable] }).price, 100);
  assert.equal(app.normalizeProduct({ ...base, variants: [affordable, expensive] }).price, 100);
});
