import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { root } from "../admin-a/support/bundle.mjs";

const source = (path) => readFileSync(`${root}/${path}`, "utf8");

test("every mutable storefront catalogue route is explicitly dynamic", () => {
  for (const file of [
    "app/page.tsx",
    "app/collections/[handle]/page.tsx",
    "app/products/[handle]/page.tsx",
    "app/api/products/route.ts",
    "app/api/products/[id]/route.ts",
  ]) {
    assert.match(source(file), /export const dynamic = "force-dynamic";/, file);
  }
  assert.match(source("lib/products.ts"), /cache: "no-store"/);
});

test("public product reads share one deterministic variant relation contract", () => {
  const serializer = source("lib/api/serialize-product.ts");
  assert.match(serializer, /orderBy:\s*\[\{ createdAt: "asc" as const \}, \{ id: "asc" as const \}\]/);
  assert.match(serializer, /left\.createdAt\.getTime\(\) - right\.createdAt\.getTime\(\)/);
  for (const file of ["lib/products/server.ts", "app/api/products/route.ts", "app/api/products/[id]/route.ts"]) {
    assert.match(source(file), /publicProductInclude/, file);
  }
});

test("homepage and collections share ProductCard while PDP and quick view share selected-variant pricing", () => {
  for (const file of ["app/page.tsx", "app/collections/[handle]/page.tsx"]) {
    assert.match(source(file), /<ProductCard/, file);
  }
  assert.match(source("components/storefront/product-card.tsx"), /formatRand\(product\.price\)/);
  for (const file of ["app/products/[handle]/page.tsx", "components/storefront/product-quick-view.tsx"]) {
    assert.match(source(file), /<ProductPurchasePanel product=\{product\}/, file);
  }
  assert.match(source("components/storefront/product-purchase-panel.tsx"), /selectedVariant\?\.price \?\? product\.price/);
  assert.match(source("lib/products.ts"), /Math\.min\(minimum, variant\.price\)/);
});

test("checkout price and historical order snapshots remain outside storefront display pricing", () => {
  const cart = source("lib/cart/service.ts");
  assert.match(cart, /lineTotal: Number\(item\.variant\.price\) \* item\.quantity/);
  assert.match(cart, /price: Number\(item\.variant\.price\)/);
  const mutations = source("lib/admin/products/mutations.ts");
  assert.doesNotMatch(mutations, /inventory\.(?:update|upsert|delete)/);
  assert.doesNotMatch(mutations, /orderItem\.(?:update|updateMany|delete|deleteMany)/);
  assert.doesNotMatch(mutations, /revalidatePath|revalidateTag/);
});
