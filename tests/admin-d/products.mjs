import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { after, before, mock, test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";
import { database } from "../admin-b1/support/database.mjs";

const context = new AsyncLocalStorage();
const origin = "https://admin-d.example.invalid";
const originalOrigin = process.env.APP_URL;
let handle, db, app, admin, customer, category;
const as = (user, action) => context.run({ user }, action);
const asAdmin = (action) => as(admin, action);

function request(path, method = "GET", body) {
  return new Request(`${origin}${path}`, {
    method,
    headers: body === undefined ? { Origin: origin } : { Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function productInput(suffix = randomUUID()) {
  return {
    name: `Admin D product ${suffix}`, slug: `admin-d-${suffix}`, description: "Catalogue description", badge: "New",
    details: ["Cotton", "Made locally"], categorySlug: category.slug, featured: false, isActive: true,
    images: [{ url: `/products/${suffix}.jpg`, alt: "Front view" }],
    variants: [{ sku: `ADMIN-D-${suffix}`, size: "M", color: "Black", price: "799.95" }],
  };
}

function updateInput(product, overrides = {}) {
  return {
    expectedUpdatedAt: product.updatedAt, name: product.name, slug: product.slug,
    description: product.description, badge: product.badge, details: product.details,
    categorySlug: product.category.slug, featured: product.featured, isActive: product.isActive,
    images: product.images.map(({ url, alt }) => ({ url, alt })), ...overrides,
  };
}

before(async () => {
  handle = await database(); db = handle.db;
  admin = await db.user.create({ data: { id: randomUUID(), email: "admin-d@example.invalid", role: "ADMIN" } });
  customer = await db.user.create({ data: { id: randomUUID(), email: "customer-d@example.invalid" } });
  category = await db.category.create({ data: { name: "Admin D category", slug: "admin-d-category" } });
  globalThis.__adminD = { db, context };
  app = await bundle(`
    export * from './lib/admin/products/queries';
    export * from './lib/admin/products/mutations';
    export { GET as listGET, POST as createPOST } from './app/api/admin/products/route';
    export { GET as detailGET, PATCH as updatePATCH, DELETE as archiveDELETE } from './app/api/admin/products/[productId]/route';
    export { POST as variantPOST } from './app/api/admin/products/[productId]/variants/route';
    export { PATCH as variantPATCH, DELETE as variantDELETE } from './app/api/admin/products/[productId]/variants/[variantId]/route';
    export { GET as publicProductListGET } from './app/api/products/route';
    export { GET as publicProductDetailGET } from './app/api/products/[id]/route';
  `, {
    "server-only": "",
    "@/lib/prisma": "export const prisma = globalThis.__adminD.db;",
    "@/lib/supabase/server": `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__adminD.context.getStore()?.user ?? null }, error: null }) } });`,
  });
  process.env.APP_URL = origin;
});

after(async () => {
  if (originalOrigin === undefined) delete process.env.APP_URL; else process.env.APP_URL = originalOrigin;
  delete globalThis.__adminD; await handle?.close();
});

test("unauthenticated and customer callers cannot read or mutate Admin D APIs", async () => {
  const beforeCount = await db.product.count();
  for (const user of [null, customer]) {
    const expected = user ? 403 : 401;
    assert.equal((await as(user, () => app.listGET(request("/api/admin/products")))).status, expected);
    assert.equal((await as(user, () => app.createPOST(request("/api/admin/products", "POST", productInput())))).status, expected);
  }
  assert.equal(await db.product.count(), beforeCount);
});

test("admin creates a product and every variant gets exactly zero inventory", async () => asAdmin(async () => {
  const input = productInput();
  const response = await app.createPOST(request("/api/admin/products", "POST", input));
  assert.equal(response.status, 201);
  const payload = await response.json(); assert.equal(payload.ok, true); assert.equal(payload.data.name, input.name);
  assert.equal("inventory" in payload.data, false); assert.equal("quantity" in payload.data.variants[0], false);
  const stored = await db.product.findUnique({ where: { id: payload.data.id }, include: { variants: { include: { inventory: true } } } });
  assert.equal(stored.variants.length, 1); assert.equal(stored.variants[0].inventory.quantity, 0);
}));

test("admin list and detail expose only approved catalogue fields", async () => asAdmin(async () => {
  const created = await app.createAdminProduct(productInput());
  const list = await app.listAdminProducts(new URLSearchParams({ search: created.slug, status: "ACTIVE", category: category.slug }));
  assert.equal(list.products.length, 1);
  for (const forbidden of ["inventory", "quantity", "salePrice", "providerId", "payment"]) assert.equal(forbidden in list.products[0], false);
  const detail = await app.getAdminProduct(created.id); assert.equal(detail.id, created.id);
  for (const forbidden of ["inventory", "quantity", "salePrice", "providerId", "payment"]) assert.equal(JSON.stringify(detail).includes(`\"${forbidden}\"`), false);
}));

test("search and status filters include archived products only when requested", async () => asAdmin(async () => {
  let product = await app.createAdminProduct(productInput());
  product = await app.archiveAdminProduct(product.id, { expectedUpdatedAt: product.updatedAt });
  assert.equal((await app.listAdminProducts(new URLSearchParams({ search: product.slug, status: "ACTIVE" }))).products.length, 0);
  assert.equal((await app.listAdminProducts(new URLSearchParams({ search: product.slug, status: "INACTIVE" }))).products[0].id, product.id);
}));

test("duplicate slug and case-insensitive SKU are conflicts with no partial product", async () => asAdmin(async () => {
  const input = productInput(); await app.createAdminProduct(input); const count = await db.product.count();
  await assert.rejects(() => app.createAdminProduct({ ...productInput(), slug: input.slug }), { status: 409 });
  const other = productInput(); other.variants[0].sku = input.variants[0].sku.toLowerCase();
  await assert.rejects(() => app.createAdminProduct(other), { status: 409 });
  assert.equal(await db.product.count(), count);
}));

test("strict create rejects inventory, sale pricing and client identity before writing", async () => asAdmin(async () => {
  for (const extra of [{ quantity: 9 }, { inventory: { quantity: 9 } }, { salePrice: "1.00" }, { role: "ADMIN" }, { userId: admin.id }]) {
    const beforeCount = await db.product.count(); await assert.rejects(() => app.createAdminProduct({ ...productInput(), ...extra }), { status: 400 }); assert.equal(await db.product.count(), beforeCount);
  }
}));

test("catalogue edit leaves inventory, cart and historical order snapshots unchanged", async () => asAdmin(async () => {
  let product = await app.createAdminProduct(productInput()); const variant = await db.productVariant.findFirstOrThrow({ where: { productId: product.id } });
  await db.inventory.update({ where: { variantId: variant.id }, data: { quantity: 7 } });
  const cart = await db.cart.create({ data: { userId: customer.id, items: { create: { productId: product.id, variantId: variant.id, quantity: 2 } } } });
  const order = await db.order.create({ data: { orderNumber: `DGN-D-${randomUUID()}`, idempotencyKey: randomUUID(), fulfilmentType: "PICKUP", subtotal: "799.95", shippingFee: "0", total: "799.95", customerName: "Snapshot name", customerEmail: "snapshot@example.invalid", pickupLocation: "Snapshot pickup", userId: customer.id, items: { create: { productId: product.id, variantId: variant.id, quantity: 1, unitPrice: "799.95", lineTotal: "799.95", title: "Snapshot title", sku: "SNAPSHOT-SKU", size: "S", color: "Blue", imageUrl: "/snapshot.jpg" } } } });
  const before = { inventory: await db.inventory.findUnique({ where: { variantId: variant.id } }), cart: await db.cart.findUnique({ where: { id: cart.id }, include: { items: true } }), order: await db.order.findUnique({ where: { id: order.id }, include: { items: true } }) };
  product = await app.updateAdminProduct(product.id, updateInput(product, { name: "Changed catalogue name", slug: `${product.slug}-changed`, images: [{ url: "/products/changed.jpg", alt: null }] }));
  assert.equal(product.name, "Changed catalogue name");
  assert.deepEqual(await db.inventory.findUnique({ where: { variantId: variant.id } }), before.inventory);
  assert.deepEqual(await db.cart.findUnique({ where: { id: cart.id }, include: { items: true } }), before.cart);
  assert.deepEqual(await db.order.findUnique({ where: { id: order.id }, include: { items: true } }), before.order);
}));

test("stale product edits are rejected without overwriting newer data", async () => asAdmin(async () => {
  const product = await app.createAdminProduct(productInput());
  const first = await app.updateAdminProduct(product.id, updateInput(product, { name: "First writer" }));
  await assert.rejects(() => app.updateAdminProduct(product.id, updateInput(product, { name: "Stale writer" })), { status: 409 });
  assert.equal((await app.getAdminProduct(product.id)).name, first.name);
}));

test("variant create initializes zero inventory and bumps product concurrency token", async () => asAdmin(async () => {
  const product = await app.createAdminProduct(productInput());
  const updated = await app.createAdminProductVariant(product.id, { expectedUpdatedAt: product.updatedAt, sku: `NEW-${randomUUID()}`, size: "L", color: "Black", price: "899.00" });
  assert.notEqual(updated.updatedAt, product.updatedAt); assert.equal(updated.variants.length, 2);
  const added = updated.variants.find((item) => item.size === "L");
  assert.equal((await db.inventory.findUnique({ where: { variantId: added.id } })).quantity, 0);
}));

test("variant edit changes catalogue metadata only and blocks duplicates", async () => asAdmin(async () => {
  let product = await app.createAdminProduct(productInput());
  product = await app.createAdminProductVariant(product.id, { expectedUpdatedAt: product.updatedAt, sku: `NEW-${randomUUID()}`, size: "L", color: "Black", price: "899.00" });
  const target = product.variants.find((item) => item.size === "L"); const inventory = await db.inventory.findUnique({ where: { variantId: target.id } });
  product = await app.updateAdminProductVariant(product.id, target.id, { expectedUpdatedAt: product.updatedAt, sku: target.sku, size: "XL", color: "Black", price: "999.00" });
  assert.equal(product.variants.find((item) => item.id === target.id).price, "999.00"); assert.deepEqual(await db.inventory.findUnique({ where: { variantId: target.id } }), inventory);
  await assert.rejects(() => app.updateAdminProductVariant(product.id, target.id, { expectedUpdatedAt: product.updatedAt, sku: product.variants[0].sku, size: "XXL", color: "Black", price: "1.00" }), { status: 409 });
  await assert.rejects(() => app.updateAdminProductVariant(product.id, target.id, { expectedUpdatedAt: product.updatedAt, sku: target.sku, size: product.variants[0].size, color: product.variants[0].color, price: "1.00" }), { status: 409 });
}));

test("variant deletion is always blocked and preserves referenced records", async () => asAdmin(async () => {
  const product = await app.createAdminProduct(productInput()); const variant = product.variants[0];
  const response = await app.variantDELETE(request("/api/admin/products/x/variants/x", "DELETE", { expectedUpdatedAt: product.updatedAt }), { params: Promise.resolve({ productId: product.id, variantId: variant.id }) });
  assert.equal(response.status, 409); assert.ok(await db.productVariant.findUnique({ where: { id: variant.id } })); assert.ok(await db.inventory.findUnique({ where: { variantId: variant.id } }));
}));

test("product archive uses isActive and preserves product, variants and inventory", async () => asAdmin(async () => {
  const product = await app.createAdminProduct(productInput()); const variant = product.variants[0];
  const archived = await app.archiveAdminProduct(product.id, { expectedUpdatedAt: product.updatedAt });
  assert.equal(archived.isActive, false); assert.ok(await db.product.findUnique({ where: { id: product.id } })); assert.ok(await db.productVariant.findUnique({ where: { id: variant.id } })); assert.ok(await db.inventory.findUnique({ where: { variantId: variant.id } }));
}));

test("public catalogue reads remain compatible and archived products disappear", async () => asAdmin(async () => {
  let product = await app.createAdminProduct(productInput());
  const listResponse = await app.publicProductListGET({ nextUrl: new URL(`${origin}/api/products?q=${encodeURIComponent(product.name)}`) });
  assert.equal(listResponse.status, 200); assert.equal((await listResponse.json()).products.some((item) => item.id === product.id), true);
  const detailResponse = await app.publicProductDetailGET(request(`/api/products/${product.slug}`), { params: Promise.resolve({ id: product.slug }) });
  assert.equal(detailResponse.status, 200); assert.equal((await detailResponse.json()).product.slug, product.slug);
  product = await app.archiveAdminProduct(product.id, { expectedUpdatedAt: product.updatedAt });
  assert.equal((await app.publicProductDetailGET(request(`/api/products/${product.slug}`), { params: Promise.resolve({ id: product.slug }) })).status, 404);
}));

test("mutation endpoint rejects missing, foreign, or malformed origin before writes", async () => asAdmin(async () => {
  for (const headers of [{ "Content-Type": "application/json" }, { Origin: "https://evil.invalid", "Content-Type": "application/json" }, { Origin: origin, "Content-Type": "text/plain" }]) {
    const beforeCount = await db.product.count(); const response = await app.createPOST(new Request(`${origin}/api/admin/products`, { method: "POST", headers, body: JSON.stringify(productInput()) })); assert.ok([400, 403].includes(response.status)); assert.equal(await db.product.count(), beforeCount);
  }
}));

test("malformed input is 400 and unexpected errors are masked", async () => asAdmin(async () => {
  const malformed = await app.createPOST(request("/api/admin/products", "POST", { role: "ADMIN" })); assert.equal(malformed.status, 400); assert.doesNotMatch(JSON.stringify(await malformed.json()), /Prisma|postgres|stack/i);
  const broken = await bundle(`export { GET } from './app/api/admin/products/route';`, {
    "server-only": "", "@/lib/prisma": `export const prisma = { user: { findUnique: async () => ({ role: 'ADMIN' }) }, product: { findMany: async () => { throw Error('postgres://secret'); } } };`,
    "@/lib/supabase/server": `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } }, error: null }) } });`,
  });
  mock.method(console, "error", () => {}); const response = await broken.GET(request("/api/admin/products")); assert.equal(response.status, 500); assert.deepEqual(await response.json(), { ok: false, message: "Internal server error" }); mock.restoreAll();
}));
