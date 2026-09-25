import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { bundle } from "../admin-a/support/bundle.mjs";

const app = await bundle(`
  export * from './components/admin/products/product-ui';
  export * from './components/admin/products/product-api';
  export { AdminProductsList } from './components/admin/products/admin-products-list';
  export { AdminProductCreateForm, AdminProductEditForm } from './components/admin/products/admin-product-form';
`, {
  "next/link": `export default function Link({ children, prefetch: _prefetch, ...props }) { return <a {...props}>{children}</a>; }`,
  "next/navigation": `export function useRouter() { return { push() {}, refresh() {} }; }`,
});

function response(status, payload = { ok: false }) { return Promise.resolve(new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } })); }
const draft = { name: "Tee", slug: "tee", description: "Desc", badge: "New", details: "Cotton\nLocal", categorySlug: "tees", featured: true, isActive: true, images: "/tee.jpg | Front" };
const variant = { sku: "TEE-M", size: "M", color: "Black", price: "899.00" };

test("list query includes search, useful filters and pagination cursor", () => {
  const query = new URLSearchParams(app.buildProductListQuery({ search: "tee", status: "ACTIVE", featured: "FEATURED", category: "tees" }, "next"));
  assert.deepEqual(Object.fromEntries(query), { limit: "20", search: "tee", status: "ACTIVE", featured: "FEATURED", category: "tees", cursor: "next" });
});

test("catalogue payload converts line-based details and image alt text without stock or sale fields", () => {
  assert.deepEqual(app.productPayload(draft), { name: "Tee", slug: "tee", description: "Desc", badge: "New", details: ["Cotton", "Local"], categorySlug: "tees", featured: true, isActive: true, images: [{ url: "/tee.jpg", alt: "Front" }] });
  assert.deepEqual(app.variantPayload(variant), variant);
  assert.equal("quantity" in app.variantPayload(variant), false); assert.equal("salePrice" in app.variantPayload(variant), false);
});

test("client list uses protected endpoint and backend cursor", async () => {
  const calls = []; const result = await app.fetchProducts({ search: "tee", status: "", featured: "", category: "" }, "cursor", async (url, init) => { calls.push([url, init]); return response(200, { ok: true, data: { products: [], nextCursor: null } }); });
  assert.equal(result.kind, "ok"); assert.equal(calls.length, 1); assert.match(calls[0][0], /^\/api\/admin\/products\?/); assert.equal(new URLSearchParams(calls[0][0].split("?")[1]).get("cursor"), "cursor");
});

test("create client sends one protected JSON mutation with no inventory quantity", async () => {
  const calls = []; await app.createProduct(draft, [variant], async (url, init) => { calls.push([url, init]); return response(201, { ok: true, data: {} }); });
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "/api/admin/products"); assert.equal(calls[0][1].method, "POST");
  const body = JSON.parse(calls[0][1].body); assert.equal(body.variants.length, 1); assert.equal("quantity" in body.variants[0], false); assert.equal("salePrice" in body.variants[0], false);
});

test("update and variant clients send optimistic timestamp exactly once", async () => {
  const product = { id: "product-one", updatedAt: "2026-09-24T12:00:00.000Z" }; const calls = [];
  const fetcher = async (url, init) => { calls.push([url, init]); return response(200, { ok: true, data: product }); };
  await app.updateProduct(product, draft, fetcher); await app.createVariant(product, variant, fetcher); await app.updateVariant(product, "variant-one", variant, fetcher);
  assert.equal(calls.length, 3); for (const [, init] of calls) assert.equal(JSON.parse(init.body).expectedUpdatedAt, product.updatedAt);
});

for (const [status, kind] of [[401, "unauthenticated"], [403, "forbidden"], [404, "not-found"], [409, "conflict"], [400, "invalid"], [500, "error"]]) {
  test(`client maps ${status} safely`, async () => assert.equal((await app.fetchProduct("product-one", () => response(status))).kind, kind));
}

test("list and create form source provide responsive, empty, loading, error and pending states", async () => {
  const list = renderToStaticMarkup(React.createElement(app.AdminProductsList));
  const create = renderToStaticMarkup(React.createElement(app.AdminProductCreateForm));
  assert.match(list, /Loading products|Create product|Search/);
  assert.match(create, /Create product|Product information|Variants|zero stock/);
  assert.doesNotMatch(create, /name="(?:quantity|salePrice)"/);
});
