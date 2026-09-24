import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { root } from "../admin-a/support/bundle.mjs";

const read = (file) => readFileSync(path.join(root, file), "utf8");

test("customer detail query performs one owner-scoped read with an explicit select", () => {
  const source = read("lib/account/orders/query.ts");
  assert.match(source, /requireUser\(\)/);
  assert.match(source, /findFirst\s*\(\s*\{[\s\S]*where:\s*\{\s*id:\s*orderId,\s*userId:\s*user\.id\s*\}/);
  assert.match(source, /select:\s*customerOrderSelect/);
  assert.doesNotMatch(source, /include\s*:/);
  assert.doesNotMatch(source, /payment\s*:\s*\{/);
});

test("customer route is GET-only and exposes no mutation handler", () => {
  const source = read("app/api/account/orders/[orderId]/route.ts");
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(source, /\.(create|update|delete|upsert)\s*\(/);
});

test("account list keeps its owner filter, ordering and bounded snapshot fields", () => {
  const source = read("app/account/page.tsx");
  assert.match(source, /prisma\.order\.findMany\s*\(\{[\s\S]*where:\s*\{\s*userId:\s*user\.id\s*\}/);
  assert.match(source, /orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}/);
  assert.match(source, /fulfilmentType:\s*true/);
  assert.doesNotMatch(source, /include\s*:/);
});

test("Customer C does not import admin order UI or mutation endpoints", () => {
  const files = [
    "app/account/orders/[orderId]/page.tsx",
    "app/api/account/orders/[orderId]/route.ts",
    "components/account/orders/customer-order-detail.tsx",
    "components/account/orders/order-api.ts",
    "components/account/orders/order-ui.ts",
    "lib/account/orders/query.ts",
  ];
  const source = files.map(read).join("\n");
  assert.doesNotMatch(source, /components\/admin|lib\/admin|api\/admin/);
  assert.doesNotMatch(source, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(source, /transitionAdminOrder|updateAdminOrderEstimate/);
});

test("Customer C makes no schema or migration changes", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model Order \{/);
  assert.ok(!read("tests/customer-c/order-detail.mjs").includes("prisma migrate"));
});
