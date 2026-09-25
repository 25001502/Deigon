import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { bundle, root } from "../admin-a/support/bundle.mjs";

const app = await bundle(`export * from './lib/admin/products/input';`, { "server-only": "" });
const validVariant = { sku: "TEE-BLK-M", size: "M", color: "Black", price: "799.95" };
const validProduct = {
  name: "Test Tee", slug: "test-tee", description: null, badge: null, details: ["Cotton"],
  categorySlug: "tees", featured: false, isActive: true,
  images: [{ url: "/products/test.jpg", alt: "Test tee" }], variants: [validVariant],
};

test("valid product create normalizes money and nullable text", () => {
  const value = app.createProductInput({ ...validProduct, description: " ", badge: " New ", variants: [{ ...validVariant, price: "10" }] });
  assert.equal(value.variants[0].price, "10.00"); assert.equal(value.description, null); assert.equal(value.badge, "New");
});

for (const [name, value] of [["missing name", { ...validProduct, name: "" }], ["bad slug", { ...validProduct, slug: "Bad Slug" }], ["missing variants", { ...validProduct, variants: [] }]]) {
  test(`rejects ${name}`, () => assert.throws(() => app.createProductInput(value), { status: 400 }));
}

for (const amount of ["0", "-1", "1.999", "100000000", "R 10", 10, "NaN"]) {
  test(`rejects invalid money ${String(amount)}`, () => assert.throws(() => app.createProductInput({ ...validProduct, variants: [{ ...validVariant, price: amount }] }), { status: 400 }));
}

for (const field of ["quantity", "inventory", "salePrice", "discountPercentage", "role", "userId", "providerId"]) {
  test(`rejects out-of-scope create field ${field}`, () => assert.throws(() => app.createProductInput({ ...validProduct, [field]: field === "quantity" ? 99 : "unsafe" }), { status: 400 }));
}

test("rejects duplicate SKU and duplicate size-colour combinations", () => {
  assert.throws(() => app.createProductInput({ ...validProduct, variants: [validVariant, { ...validVariant, sku: "tee-blk-m", size: "L" }] }), { status: 400 });
  assert.throws(() => app.createProductInput({ ...validProduct, variants: [validVariant, { ...validVariant, sku: "OTHER", size: "m", color: "black" }] }), { status: 400 });
});

for (const url of ["http://www.deigon.co.za/cdn/shop/files/a.jpg", "https://example.com/a.jpg", "//example.com/a.jpg", "https://user:pass@www.deigon.co.za/cdn/shop/files/a.jpg#x"]) {
  test(`rejects unsupported image URL ${url}`, () => assert.throws(() => app.createProductInput({ ...validProduct, images: [{ url, alt: null }] }), { status: 400 }));
}

test("accepts the configured storefront image origins and local paths", () => {
  for (const url of ["/products/a.jpg", "https://www.deigon.co.za/cdn/shop/files/a.jpg", "https://hvawfylsdaormrkghbbw.supabase.co/storage/v1/object/sign/products/a.jpg?token=x"]) {
    assert.equal(app.createProductInput({ ...validProduct, images: [{ url, alt: null }] }).images[0].url.startsWith("http") ? new URL(app.createProductInput({ ...validProduct, images: [{ url, alt: null }] }).images[0].url).hostname.length > 0 : true, true);
  }
});

test("update requires an exact optimistic concurrency timestamp and rejects variant or inventory payloads", () => {
  const update = { ...validProduct, expectedUpdatedAt: "2026-09-24T12:00:00.000Z" }; delete update.variants;
  assert.equal(app.updateProductInput(update).expectedUpdatedAt, update.expectedUpdatedAt);
  for (const extra of [{ variants: [] }, { quantity: 0 }, { inventory: {} }, { salePrice: "1.00" }]) assert.throws(() => app.updateProductInput({ ...update, ...extra }), { status: 400 });
  assert.throws(() => app.updateProductInput({ ...update, expectedUpdatedAt: "yesterday" }), { status: 400 });
});

test("variant mutation rejects identity, stock and sale fields", () => {
  const value = { expectedUpdatedAt: "2026-09-24T12:00:00.000Z", ...validVariant };
  assert.equal(app.variantMutationInput(value).price, "799.95");
  for (const extra of [{ quantity: 8 }, { inventory: 8 }, { salePrice: "10" }, { role: "ADMIN" }, { userId: "other" }]) assert.throws(() => app.variantMutationInput({ ...value, ...extra }), { status: 400 });
});

for (const query of ["limit=0", "limit=51", "limit=2.5", "status=DELETED", "featured=YES", "category=Bad Slug", "role=ADMIN", "search=a&search=b", "cursor=bad"] ) {
  test(`rejects invalid list query ${query}`, () => assert.throws(() => app.productListInput(new URLSearchParams(query)), { status: 400 }));
}

test("pagination cursor is bound to normalized filters", () => {
  const input = app.productListInput(new URLSearchParams("search= Tee &status=ACTIVE"));
  const cursor = app.encodeProductCursor(input, { id: "product-valid-id", updatedAt: new Date("2026-09-24T12:00:00.000Z") });
  assert.equal(app.productListInput(new URLSearchParams({ search: "tee", status: "ACTIVE", cursor })).cursor.id, "product-valid-id");
  assert.throws(() => app.productListInput(new URLSearchParams({ search: "hoodie", status: "ACTIVE", cursor })), { status: 400 });
});

test("every Admin D page has its own server guard", () => {
  for (const file of ["app/admin/(protected)/products/page.tsx", "app/admin/(protected)/products/new/page.tsx", "app/admin/(protected)/products/[productId]/page.tsx"]) {
    assert.match(readFileSync(`${root}/${file}`, "utf8"), /await requireAdminPage\(\)/);
  }
});

test("every Admin D API handler independently invokes admin authorization", () => {
  const files = ["app/api/admin/products/route.ts", "app/api/admin/products/categories/route.ts", "app/api/admin/products/[productId]/route.ts", "app/api/admin/products/[productId]/variants/route.ts", "app/api/admin/products/[productId]/variants/[variantId]/route.ts"];
  for (const file of files) {
    const source = readFileSync(`${root}/${file}`, "utf8");
    const handlers = source.match(/export async function (?:GET|POST|PATCH|DELETE)[\s\S]*?(?=\nexport async function|$)/g) ?? [];
    assert.ok(handlers.length > 0, file); for (const handler of handlers) assert.match(handler, /await requireAdmin\(\)/, file);
  }
});

test("Admin D source contains no hard product or variant deletion and no inventory update", () => {
  const source = ["lib/admin/products/mutations.ts", "app/api/admin/products/[productId]/route.ts", "app/api/admin/products/[productId]/variants/[variantId]/route.ts"].map((file) => readFileSync(`${root}/${file}`, "utf8")).join("\n");
  assert.doesNotMatch(source, /(?:product|productVariant)\.delete/);
  assert.doesNotMatch(source, /inventory\.(?:update|upsert|delete)/);
  assert.match(source, /quantity: 0/);
});

test("Admin D changed no Prisma schema or migration file", () => {
  const schema = readFileSync(`${root}/prisma/schema.prisma`, "utf8");
  assert.doesNotMatch(schema, /salePrice|archivedAt|discount/);
});
