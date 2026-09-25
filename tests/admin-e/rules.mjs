import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { bundle, root } from "../admin-a/support/bundle.mjs";

const app = await bundle(`
  export * from './lib/admin/inventory/input';
  export * from './lib/admin/inventory/serialize';
`, { "server-only": "" });

const valid = {
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  expectedQuantity: 8,
  expectedUpdatedAt: "2026-09-25T12:00:00.000Z",
  delta: 20,
  reason: "RESTOCK",
  note: " New delivery ",
};

test("strict adjustment input normalizes the approved exact shape", () => {
  assert.deepEqual(app.inventoryAdjustmentInput(valid), { ...valid, note: "New delivery" });
  assert.equal(app.inventoryAdjustmentInput({ ...valid, note: "  " }).note, null);
});

test("adjustment input rejects unknown and client-controlled identity or domain fields", () => {
  for (const extra of ["quantity", "quantityAfter", "adminId", "adminUserId", "adminEmail", "userId", "role", "price", "salePrice", "payment", "order", "fulfilmentStatus"]) {
    assert.throws(() => app.inventoryAdjustmentInput({ ...valid, [extra]: "forged" }), { status: 400 }, extra);
  }
});

test("UUID and exact timestamp validation fail closed", () => {
  for (const idempotencyKey of ["", "not-a-uuid", "11111111-1111-0111-8111-111111111111"]) {
    assert.throws(() => app.inventoryAdjustmentInput({ ...valid, idempotencyKey }), { status: 400 });
  }
  for (const expectedUpdatedAt of ["yesterday", "2026-09-25", "2026-09-25T12:00:00Z"]) {
    assert.throws(() => app.inventoryAdjustmentInput({ ...valid, expectedUpdatedAt }), { status: 400 });
  }
});

test("quantity and delta validation enforces PostgreSQL integer semantics", () => {
  for (const expectedQuantity of [-1, 1.5, Number.MAX_SAFE_INTEGER, "8"]) {
    assert.throws(() => app.inventoryAdjustmentInput({ ...valid, expectedQuantity }), { status: 400 });
  }
  for (const delta of [0, 1.5, 2_147_483_648, -2_147_483_649, Number.NaN, "2"]) {
    assert.throws(() => app.inventoryAdjustmentInput({ ...valid, delta }), { status: 400 });
  }
});

test("reason and note validation use only approved values and bounds", () => {
  for (const reason of ["MANUAL", "LOW_STOCK", "restock", null]) {
    assert.throws(() => app.inventoryAdjustmentInput({ ...valid, reason }), { status: 400 });
  }
  assert.throws(() => app.inventoryAdjustmentInput({ ...valid, note: "x".repeat(501) }), { status: 400 });
  assert.throws(() => app.inventoryAdjustmentInput({ ...valid, note: 42 }), { status: 400 });
});

test("list validates search, filters, stock states and cursor binding", () => {
  const input = app.inventoryListInput(new URLSearchParams("search= Shirt &category=tees&status=INACTIVE&stock=OUT_OF_STOCK&limit=20"));
  assert.equal(input.search, "Shirt"); assert.equal(input.stock, "OUT_OF_STOCK");
  const cursor = app.encodeInventoryCursor(input, { id: "variant-valid-id", updatedAt: new Date("2026-09-25T12:00:00.000Z") });
  assert.equal(app.inventoryListInput(new URLSearchParams({ search: "Shirt", category: "tees", status: "INACTIVE", stock: "OUT_OF_STOCK", limit: "20", cursor })).cursor.id, "variant-valid-id");
  assert.throws(() => app.inventoryListInput(new URLSearchParams({ search: "Other", cursor })), { status: 400 });
});

for (const query of ["stock=LOW_STOCK", "status=DELETED", "category=Bad Slug", "limit=0", "limit=51", "role=ADMIN", "search=a&search=b", "cursor=bad"]) {
  test(`invalid inventory list query is rejected: ${query}`, () => {
    assert.throws(() => app.inventoryListInput(new URLSearchParams(query)), { status: 400 });
  });
}

test("history pagination accepts only limit and a valid cursor", () => {
  const cursor = app.encodeAdjustmentCursor({ id: "adjustment-valid-id", createdAt: new Date("2026-09-25T12:00:00.000Z") });
  assert.equal(app.adjustmentHistoryInput(new URLSearchParams({ limit: "10", cursor })).cursor.id, "adjustment-valid-id");
  for (const query of ["search=x", "limit=0", "cursor=bad"]) assert.throws(() => app.adjustmentHistoryInput(new URLSearchParams(query)), { status: 400 });
});

test("stock states distinguish missing, zero and positive inventory without a low-stock state", () => {
  assert.equal(app.stockState(null), "MISSING_INVENTORY");
  assert.equal(app.stockState({ quantity: 0 }), "OUT_OF_STOCK");
  assert.equal(app.stockState({ quantity: 1 }), "IN_STOCK");
  assert.equal(app.stockState({ quantity: 2 }), "IN_STOCK");
});

test("every Admin E page has an independent server guard", () => {
  for (const file of ["app/admin/(protected)/inventory/page.tsx", "app/admin/(protected)/inventory/[variantId]/page.tsx"]) {
    assert.match(readFileSync(`${root}/${file}`, "utf8"), /await requireAdminPage\(\)/, file);
  }
});

test("every Admin E API handler independently invokes requireAdmin", () => {
  const files = ["app/api/admin/inventory/route.ts", "app/api/admin/inventory/[variantId]/route.ts", "app/api/admin/inventory/[variantId]/adjustments/route.ts"];
  for (const file of files) {
    const source = readFileSync(`${root}/${file}`, "utf8");
    const handlers = source.match(/export async function (?:GET|POST)[\s\S]*?(?=\nexport async function|$)/g) ?? [];
    assert.ok(handlers.length > 0, file);
    for (const handler of handlers) assert.match(handler, /await requireAdmin\(\)/, file);
  }
});

test("history has no PATCH or DELETE API and inventory UI has no forbidden controls", () => {
  const route = readFileSync(`${root}/app/api/admin/inventory/[variantId]/adjustments/route.ts`, "utf8");
  assert.doesNotMatch(route, /export async function (?:PATCH|DELETE)/);
  const ui = readFileSync(`${root}/components/admin/inventory/admin-inventory-detail.tsx`, "utf8");
  assert.doesNotMatch(ui, /name="(?:quantity|quantityAfter|price|salePrice|payment|order|customer)/);
  assert.match(ui, /Quantity delta/);
});

test("Admin E does not modify checkout, payment, fulfilment or expiry source", () => {
  const source = ["lib/admin/inventory/mutations.ts", "lib/admin/inventory/queries.ts"].map((file) => readFileSync(`${root}/${file}`, "utf8")).join("\n");
  assert.doesNotMatch(source, /(?:order|payment|cartItem)\.(?:create|update|delete)|expireUnpaid|processYoco|salePrice/);
});

test("migration is additive and contains approved constraints and FK actions", () => {
  const sql = readFileSync(`${root}/prisma/migrations/20260925000000_admin_inventory_adjustments/migration.sql`, "utf8");
  const executableSql = sql.replace(/^\s*--.*$/gm, "").trim();
  assert.match(executableSql, /^BEGIN;\s*CREATE TYPE/);
  assert.match(executableSql, /ON DELETE SET NULL ON UPDATE CASCADE;\s*COMMIT;$/);
  assert.match(sql, /CREATE TYPE "InventoryAdjustmentReason"/);
  assert.match(sql, /CREATE TABLE "InventoryAdjustment"/);
  assert.match(sql, /Inventory_quantity_nonnegative_check[\s\S]*NOT VALID[\s\S]*VALIDATE CONSTRAINT/);
  assert.match(sql, /quantityDelta" <> 0/);
  assert.match(sql, /quantityBefore" >= 0 AND "quantityAfter" >= 0/);
  assert.match(sql, /quantityAfter"::bigint = "quantityBefore"::bigint \+ "quantityDelta"::bigint/);
  assert.match(sql, /InventoryAdjustment_variantId_fkey[\s\S]*ON DELETE RESTRICT/);
  assert.match(sql, /InventoryAdjustment_adminUserId_fkey[\s\S]*ON DELETE SET NULL/);
  assert.doesNotMatch(sql, /^\s*(?:DROP|TRUNCATE|UPDATE|DELETE)\b/im);
  assert.doesNotMatch(sql, /INSERT INTO "InventoryAdjustment"/i);
});
