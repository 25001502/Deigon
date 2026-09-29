import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { root } from "../admin-a/support/bundle.mjs";

const source = (file) => readFileSync(`${root}/${file}`, "utf8");
const migration = source("prisma/migrations/20260926000000_admin_sale_pricing_foundation/migration.sql");
const resolver = source("lib/pricing/resolve-variant-price.ts");

test("F2 schema adds only nullable variant sale configuration with absolute timestamps", () => {
  const schema = source("prisma/schema.prisma");
  assert.match(schema, /salePrice\s+Decimal\?\s+@db\.Decimal\(10, 2\)/);
  assert.match(schema, /saleStartsAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/);
  assert.match(schema, /saleEndsAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/);
  assert.match(schema, /price\s+Decimal\s+@db\.Decimal\(10, 2\)/);
});

test("F2 migration is additive, transaction-wrapped and constrained", () => {
  const executable = migration.replace(/^\s*--.*$/gm, "").trim();
  assert.match(executable, /^BEGIN;\s*ALTER TABLE "ProductVariant"/);
  assert.match(executable, /COMMIT;$/);
  for (const column of ["salePrice", "saleStartsAt", "saleEndsAt"]) assert.match(migration, new RegExp(`ADD COLUMN "${column}"`));
  assert.match(migration, /"salePrice" IS NULL OR "salePrice" > 0/);
  assert.match(migration, /"salePrice" IS NULL OR "salePrice" < "price"/);
  assert.match(migration, /"salePrice" IS NOT NULL OR \("saleStartsAt" IS NULL AND "saleEndsAt" IS NULL\)/);
  assert.match(migration, /"saleEndsAt" > "saleStartsAt"/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|UPDATE|DELETE|INSERT|CREATE\s+INDEX)\b/im);
  assert.doesNotMatch(migration, /(?:"Order"|"OrderItem"|"Payment"|"Cart"|"CartItem"|"Inventory")/);
});

test("resolver remains pure, server-only and Decimal-safe", () => {
  assert.match(resolver, /^import "server-only";/);
  assert.match(resolver, /export type VariantSaleState = "NONE" \| "SCHEDULED" \| "ACTIVE" \| "EXPIRED"/);
  assert.match(resolver, /export class VariantPricingInvariantError extends Error/);
  assert.match(resolver, /export function resolveVariantPrice\(input: VariantPriceInput, at: Date\)/);
  assert.match(resolver, /saleStartsAt.*atMilliseconds < startMilliseconds/s);
  assert.match(resolver, /endMilliseconds.*atMilliseconds >= endMilliseconds/s);
  assert.doesNotMatch(resolver, /new Date\s*\(/);
  assert.doesNotMatch(resolver, /\b(?:Number|parseFloat|Math\.round)\s*\(/);
  assert.doesNotMatch(resolver, /toFixed\s*\(/);
  assert.doesNotMatch(resolver, /getHours|setHours|toLocaleString/);
  assert.doesNotMatch(resolver, /prisma\.|fetch\(|window\.|document\./);
});

test("F6 leaves payment provider and webhook authority isolated from sale configuration", () => {
  for (const file of [
    "lib/payments/yoco.ts",
    "lib/payments/prepare-order-payment.ts",
    "lib/payments/process-yoco-webhook.ts",
  ]) assert.doesNotMatch(source(file), /salePrice|saleStartsAt|saleEndsAt/, file);
});

test("F3 route and services independently enforce admin authorization", () => {
  const route = source("app/api/admin/products/[productId]/variants/[variantId]/sale/route.ts");
  const handlers = route.match(/export async function (?:GET|PATCH)[\s\S]*?(?=\nexport async function|$)/g) ?? [];
  assert.equal(handlers.length, 2);
  for (const handler of handlers) assert.match(handler, /await requireAdmin\(\)/);
  for (const file of ["lib/admin/products/sale/queries.ts", "lib/admin/products/sale/mutations.ts"]) {
    assert.match(source(file), /await requireAdmin\(\)/, file);
  }
});

test("F3 PATCH reuses strict origin, JSON and no-store response handling", () => {
  const route = source("app/api/admin/products/[productId]/variants/[variantId]/sale/route.ts");
  assert.match(route, /mutationBody\(request\)/);
  assert.match(route, /success\(/);
  assert.match(route, /failure\(/);
  const http = source("lib/admin/products/http.ts");
  assert.match(http, /request\.headers\.get\("origin"\) !== applicationOrigin\(\)/);
  assert.match(http, /application\/json/);
  assert.match(http, /private, no-store, max-age=0/);
});

test("Admin D and Admin F share monotonic Product tokens while pricing uses wall clock", () => {
  const concurrency = source("lib/admin/products/concurrency.ts");
  assert.match(concurrency, /export function nextProductUpdatedAt\(current: Date, now = new Date\(\)\)/);
  assert.match(concurrency, /currentMilliseconds \+ 1/);
  const saleMutation = source("lib/admin/products/sale/mutations.ts");
  assert.match(saleMutation, /import \{ nextProductUpdatedAt \} from "\.\.\/concurrency"/);
  assert.match(saleMutation, /const pricingAt = new Date\(\)/);
  assert.match(saleMutation, /nextProductUpdatedAt\(product\.updatedAt, pricingAt\)/);
  assert.match(saleMutation, /serializeAdminVariantSale\(product\.id, updatedAt, updated, pricingAt\)/);
  assert.doesNotMatch(saleMutation, /function nextUpdatedAt/);
});

test("F3 and F4 keep Admin D payloads isolated from sale scheduling", () => {
  const changedScope = [
    "components/admin/products/admin-product-form.tsx",
    "components/admin/products/product-api.ts",
    "components/admin/products/product-ui.ts",
  ];
  for (const file of changedScope) assert.doesNotMatch(source(file), /saleStartsAt|saleEndsAt/, file);
});
