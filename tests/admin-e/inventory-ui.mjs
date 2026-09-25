import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { bundle, root } from "../admin-a/support/bundle.mjs";

const app = await bundle(`
  export * from './components/admin/inventory/inventory-ui';
  export * from './components/admin/inventory/inventory-api';
  export { AdminInventoryList } from './components/admin/inventory/admin-inventory-list';
  export { AdminInventoryDetail } from './components/admin/inventory/admin-inventory-detail';
`, {
  "next/link": `export default function Link({ children, prefetch: _prefetch, ...props }) { return <a {...props}>{children}</a>; }`,
});

function response(status, payload = { ok: false }) {
  return Promise.resolve(new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }));
}

const detail = {
  variantId: "variant-one",
  product: { name: "Tee", slug: "tee", isActive: true, category: { name: "Tees", slug: "tees" } },
  variant: { sku: "TEE-M", size: "M", color: "Black" },
  inventory: { quantity: 8, updatedAt: "2026-09-25T12:00:00.000Z", state: "IN_STOCK" },
  lastManualAdjustmentAt: null,
};

test("inventory query includes approved filters and cursor but no low-stock threshold", () => {
  const query = new URLSearchParams(app.buildInventoryQuery({ search: "tee", category: "tees", status: "INACTIVE", stock: "OUT_OF_STOCK" }, "next"));
  assert.deepEqual(Object.fromEntries(query), { limit: "20", search: "tee", category: "tees", status: "INACTIVE", stock: "OUT_OF_STOCK", cursor: "next" });
  assert.equal(query.has("lowStock"), false);
});

test("adjustment payload uses delta and server concurrency tokens without identity or absolute stock", () => {
  const payload = app.adjustmentPayload(detail, { delta: "+20", reason: "RESTOCK", note: " Delivery " }, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(payload, {
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    expectedQuantity: 8,
    expectedUpdatedAt: "2026-09-25T12:00:00.000Z",
    delta: 20,
    reason: "RESTOCK",
    note: "Delivery",
  });
  for (const key of ["quantity", "quantityAfter", "adminId", "adminUserId", "adminEmail", "price", "payment", "order"]) assert.equal(key in payload, false);
});

test("client list, detail and history use protected no-store endpoints", async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push([url, init]); return response(200, { ok: true, data: url.includes("adjustments") ? { adjustments: [], nextCursor: null } : url.endsWith("variant-one") ? detail : { inventory: [], nextCursor: null } }); };
  await app.fetchInventory(app.EMPTY_INVENTORY_FILTERS, null, fetcher);
  await app.fetchInventoryDetail("variant-one", fetcher);
  await app.fetchInventoryAdjustments("variant-one", null, fetcher);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(([url, init]) => url.startsWith("/api/admin/inventory") && init.cache === "no-store" && init.credentials === "same-origin"));
});

test("adjustment client sends exactly one JSON POST with the caller-provided idempotency key", async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push([url, init]); return response(200, { ok: true, data: { inventory: detail, adjustment: {}, replayed: false } }); };
  await app.createInventoryAdjustment(detail, { delta: "-2", reason: "DAMAGE", note: "Damaged" }, "11111111-1111-4111-8111-111111111111", fetcher);
  assert.equal(calls.length, 1); assert.equal(calls[0][1].method, "POST");
  assert.equal(calls[0][1].headers["Content-Type"], "application/json");
  assert.equal(JSON.parse(calls[0][1].body).idempotencyKey, "11111111-1111-4111-8111-111111111111");
});

for (const [status, kind] of [[400, "invalid"], [401, "unauthenticated"], [403, "forbidden"], [404, "not-found"], [409, "conflict"], [500, "error"]]) {
  test(`inventory client maps ${status} safely`, async () => {
    assert.equal((await app.fetchInventoryDetail("variant-one", () => response(status))).kind, kind);
  });
}

test("list UI renders responsive filters, stock states, loading and empty-state support", () => {
  const html = renderToStaticMarkup(React.createElement(app.AdminInventoryList));
  assert.match(html, /Stock management|Search|Category|Product visibility|Stock state|Loading inventory/);
  assert.match(html, /Missing inventory|Out of stock|In stock/);
  assert.doesNotMatch(html, /Low stock|sale price|payment|customer/i);
});

test("detail UI provides delta-only form, pending copy, history and conflict-refresh code", () => {
  const html = renderToStaticMarkup(React.createElement(app.AdminInventoryDetail, { variantId: "variant-one" }));
  assert.match(html, /Loading inventory detail/);
  const source = readFileSync(`${root}/components/admin/inventory/admin-inventory-detail.tsx`, "utf8");
  assert.match(source, /Quantity delta|Record adjustment|Saving adjustment|Manual adjustment history|Archived product/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /result\.kind === "conflict"[\s\S]*await load\(\)/);
  assert.match(source, /if \(!detail[\s\S]*pending\) return/);
  assert.doesNotMatch(source, /name="quantity"|name="price"|name="salePrice"|name="payment"|name="customer"/);
});

test("network/server uncertainty retains the same key while field changes clear it", () => {
  const source = readFileSync(`${root}/components/admin/inventory/admin-inventory-detail.tsx`, "utf8");
  assert.match(source, /const key = idempotencyKey\.current \?\? crypto\.randomUUID\(\)/);
  assert.match(source, /Retain the key for a deliberate retry/);
  assert.match(source, /function changeDraft[\s\S]*idempotencyKey\.current = null/);
});
