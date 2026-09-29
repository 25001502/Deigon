import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma } from "@prisma/client";

import { bundle, root } from "../admin-a/support/bundle.mjs";

const source = (file) => readFileSync(`${root}/${file}`, "utf8");
const app = await bundle(`
  export { serializeProduct } from './lib/api/serialize-product';
  export { normalizeProduct } from './lib/products';
  export { formatRand } from './lib/money';
  export { ProductPrice, currentPriceFor } from './components/storefront/product-price';
  export { ProductCard } from './components/storefront/product-card';
`, {
  "server-only": "",
  "next/image": `export default function Image(props) { return <img {...props} />; }`,
  "next/link": `export default function Link({ children, ...props }) { return <a {...props}>{children}</a>; }`,
  "./product-quick-view": `export function ProductQuickView() { return null; }`,
});

const at = (value) => new Date(value);
const money = (value) => new Prisma.Decimal(value);

function databaseProduct(variantOverrides = []) {
  const baseVariants = [
    { id: "variant-a", sku: "A", size: "S", color: "Black", price: money("900.00"), salePrice: null, saleStartsAt: null, saleEndsAt: null, createdAt: at("2026-01-01T00:00:00.000Z"), inventory: { quantity: 2 } },
    { id: "variant-b", sku: "B", size: "M", color: "Black", price: money("1000.00"), salePrice: null, saleStartsAt: null, saleEndsAt: null, createdAt: at("2026-01-02T00:00:00.000Z"), inventory: { quantity: 3 } },
  ];
  const variants = baseVariants.map((variant, index) => ({ ...variant, ...(variantOverrides[index] ?? {}) }));
  return {
    id: "product-f5",
    slug: "product-f5",
    name: "F5 product",
    description: "Public product",
    badge: null,
    details: [],
    featured: true,
    isActive: true,
    createdAt: at("2026-01-01T00:00:00.000Z"),
    updatedAt: at("2026-01-01T00:00:00.000Z"),
    categoryId: "category-f5",
    category: { id: "category-f5", name: "F5", slug: "f5" },
    images: [],
    variants,
  };
}

function publicProduct(variants) {
  return {
    id: "product-f5",
    slug: "product-f5",
    name: "F5 product",
    description: null,
    badge: null,
    details: [],
    featured: true,
    isActive: true,
    category: { id: "category-f5", name: "F5", slug: "f5" },
    images: [],
    variants,
  };
}

const variant = (overrides = {}) => ({
  id: "variant-public",
  sku: "PUBLIC",
  size: "M",
  color: "Black",
  price: 900,
  normalPrice: 900,
  isOnSale: false,
  inventory: { quantity: 2, inStock: true },
  ...overrides,
});

test("public serializer hides future schedule configuration", () => {
  const product = databaseProduct([{
    salePrice: money("700.95"),
    saleStartsAt: at("2026-10-02T00:00:00.000Z"),
    saleEndsAt: at("2026-10-03T00:00:00.000Z"),
  }]);
  const serialized = app.serializeProduct(product, at("2026-10-01T00:00:00.000Z"));
  assert.deepEqual(
    (({ price, normalPrice, isOnSale }) => ({ price, normalPrice, isOnSale }))(serialized.variants[0]),
    { price: 900, normalPrice: 900, isOnSale: false },
  );
  assert.deepEqual(
    (({ price, normalPrice, isOnSale }) => ({ price, normalPrice, isOnSale }))(serialized.variants[1]),
    { price: 1000, normalPrice: 1000, isOnSale: false },
  );
  assert.doesNotMatch(JSON.stringify(serialized), /salePrice|saleStartsAt|saleEndsAt|SCHEDULED|EXPIRED|700\.95/);
});

for (const [name, pricingAt, expected] of [
  ["exact start", "2026-10-02T00:00:00.000Z", { price: 700.95, normalPrice: 900, isOnSale: true }],
  ["active", "2026-10-02T12:00:00.000Z", { price: 700.95, normalPrice: 900, isOnSale: true }],
  ["exact end", "2026-10-03T00:00:00.000Z", { price: 900, normalPrice: 900, isOnSale: false }],
  ["expired", "2026-10-04T00:00:00.000Z", { price: 900, normalPrice: 900, isOnSale: false }],
]) test(`public serialization resolves ${name} at an injected timestamp`, () => {
  const product = databaseProduct([{
    salePrice: money("700.95"),
    saleStartsAt: at("2026-10-02T00:00:00.000Z"),
    saleEndsAt: at("2026-10-03T00:00:00.000Z"),
  }]);
  const result = app.serializeProduct(product, at(pricingAt)).variants[0];
  assert.deepEqual(
    (({ price, normalPrice, isOnSale }) => ({ price, normalPrice, isOnSale }))(result),
    expected,
  );
  assert.doesNotMatch(JSON.stringify(result), /salePrice|saleStartsAt|saleEndsAt|SCHEDULED|EXPIRED/);
});

test("product minimum keeps normal and effective prices on the same sale variant", () => {
  const product = app.normalizeProduct(publicProduct([
    variant({ id: "a", sku: "A", price: 900, normalPrice: 900 }),
    variant({ id: "b", sku: "B", price: 750, normalPrice: 1000, isOnSale: true }),
  ]));
  assert.deepEqual(
    (({ price, normalPrice, isOnSale }) => ({ price, normalPrice, isOnSale }))(product),
    { price: 750, normalPrice: 1000, isOnSale: true },
  );
});

test("a sale that is not cheapest does not create a crossed product comparison", () => {
  const product = app.normalizeProduct(publicProduct([
    variant({ id: "a", sku: "A", price: 700, normalPrice: 700 }),
    variant({ id: "b", sku: "B", price: 800, normalPrice: 1000, isOnSale: true }),
  ]));
  assert.deepEqual(
    (({ price, normalPrice, isOnSale }) => ({ price, normalPrice, isOnSale }))(product),
    { price: 700, normalPrice: 700, isOnSale: false },
  );
});

test("equal effective prices keep deterministic incoming variant order", () => {
  const first = variant({ id: "first", sku: "FIRST", price: 750, normalPrice: 1000, isOnSale: true });
  const second = variant({ id: "second", sku: "SECOND", price: 750, normalPrice: 900, isOnSale: true });
  const product = app.normalizeProduct(publicProduct([first, second]));
  assert.equal(product.price, 750);
  assert.equal(product.normalPrice, 1000);
});

test("storefront money retains cents while whole-rand prices stay compact", () => {
  const fractional = app.formatRand(1199.95);
  assert.match(fractional, /95/);
  assert.doesNotMatch(fractional, /1.?200/);
  assert.doesNotMatch(app.formatRand(1499), /[,.]00(?:\D|$)/);
});

test("active sale markup exposes regular and sale prices without relying on colour", () => {
  const html = renderToStaticMarkup(React.createElement(app.ProductPrice, {
    pricing: { price: 1199.95, normalPrice: 1499, isOnSale: true },
  }));
  assert.match(html, /<del>/);
  assert.match(html, /Regular price/);
  assert.match(html, /Sale price/);
  assert.match(html, />Sale</);
  assert.match(html, /95/);
});

test("ordinary price markup has no crossed-out comparison", () => {
  const html = renderToStaticMarkup(React.createElement(app.ProductPrice, {
    pricing: { price: 1499, normalPrice: 1499, isOnSale: false },
  }));
  assert.doesNotMatch(html, /<del>|Sale price|>Sale</);
});

test("product card uses the active product-level comparison", () => {
  const product = app.normalizeProduct(publicProduct([
    variant({ price: 1199.95, normalPrice: 1499, isOnSale: true }),
  ]));
  const html = renderToStaticMarkup(React.createElement(app.ProductCard, { product }));
  assert.match(html, /<del>/);
  assert.match(html, /Sale price/);
  assert.match(html, /95/);

  const ordinary = app.normalizeProduct(publicProduct([variant()]));
  const ordinaryHtml = renderToStaticMarkup(React.createElement(app.ProductCard, { product: ordinary }));
  assert.doesNotMatch(ordinaryHtml, /<del>|Sale price|>Sale</);
});

test("purchase pricing switches from the product candidate to the exact selected variant", () => {
  const productPricing = { price: 750, normalPrice: 1000, isOnSale: true };
  const normalVariant = { price: 900, normalPrice: 900, isOnSale: false };
  const saleVariant = { price: 850, normalPrice: 1100, isOnSale: true };
  assert.equal(app.currentPriceFor(productPricing), productPricing);
  assert.equal(app.currentPriceFor(productPricing, normalVariant), normalVariant);
  assert.equal(app.currentPriceFor(productPricing, saleVariant), saleVariant);
});

test("public APIs capture one timestamp and explicitly prevent stale price caching", () => {
  for (const file of ["app/api/products/route.ts", "app/api/products/[id]/route.ts"]) {
    const route = source(file);
    assert.equal((route.match(/const pricingAt = new Date\(\)/g) ?? []).length, 1, file);
    assert.match(route, /serializeProduct\([^\n]+pricingAt\)/, file);
    assert.match(route, /Cache-Control": "no-store, max-age=0"/, file);
  }
  const server = source("lib/products/server.ts");
  assert.match(server, /const pricingAt = options\.pricingAt \?\? new Date\(\)/);
  assert.match(server, /serializeProduct\(product, pricingAt\)/);
  const detailPage = source("app/products/[handle]/page.tsx");
  assert.equal((detailPage.match(/const pricingAt = new Date\(\)/g) ?? []).length, 1);
  assert.match(detailPage, /getProductBySlugFromDb\(handle, pricingAt\)/);
  assert.match(detailPage, /pricingAt,/);
});

test("F5 uses shared UI across cards, PDP, Quick View and related products", () => {
  assert.match(source("components/storefront/product-card.tsx"), /<ProductPrice pricing=\{product\}/);
  assert.match(source("components/storefront/product-purchase-panel.tsx"), /<ProductPrice pricing=\{displayPricing\}/);
  assert.match(source("components/storefront/product-quick-view.tsx"), /<ProductPurchasePanel product=\{product\}/);
  assert.match(source("app/products/[handle]/page.tsx"), /<ProductCard key=\{relatedProduct\.handle\}/);
});

test("sale timing stays server-side while F6 owns cart and checkout authority", () => {
  const publicClient = [
    "components/storefront/product-card.tsx",
    "components/storefront/product-price.tsx",
    "components/storefront/product-purchase-panel.tsx",
    "components/storefront/product-quick-view.tsx",
    "lib/products.ts",
  ].map(source).join("\n");
  assert.doesNotMatch(publicClient, /saleStartsAt|saleEndsAt|Date\.now|setInterval|WebSocket/);
  assert.match(source("lib/cart/service.ts"), /resolveVariantPrice\(item\.variant, pricingAt\)/);
  assert.match(source("lib/checkout/service.ts"), /resolveVariantPrice\(item\.variant, pricingAt\)/);
  assert.doesNotMatch(source("app/api/checkout/route.ts"), /price|subtotal|discount|salePrice/);
  for (const file of ["lib/payments/yoco.ts", "lib/payments/process-yoco-webhook.ts"]) {
    assert.doesNotMatch(source(file), /resolveVariantPrice|salePrice|saleStartsAt|saleEndsAt/, file);
  }
});
