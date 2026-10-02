import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { root } from "../admin-a/support/bundle.mjs";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("G2 keeps both page and server query authorization boundaries", () => {
  assert.match(source("app/admin/(protected)/page.tsx"), /await requireAdminPage\(\)/);
  assert.match(source("lib/admin/dashboard/queries.ts"), /await requireAdmin\(\)/);
});

test("G2 has a single paid predicate shared by revenue, workload, trend and top SKUs", () => {
  const query = source("lib/admin/dashboard/queries.ts");
  assert.equal((query.match(/const authoritativePaidOrder = Prisma\.sql/g) || []).length, 1);
  assert.equal((query.match(/WHERE \$\{authoritativePaidOrder\}/g) || []).length, 4);
  for (const predicate of [
    'o."paymentStatus" = \'PAID\'', 'p."status" = \'PAID\'',
    'o."confirmedAt" IS NOT NULL', 'p."amount" = o."total"',
    'o."cancelledAt" IS NULL', 'o."inventoryReleasedAt" IS NULL',
    'o."fulfilmentType" = \'DELIVERY\'',
    'o."status" IN (\'CONFIRMED\', \'PROCESSING\', \'SHIPPED\', \'DELIVERED\')',
    'o."fulfilmentType" = \'PICKUP\'',
    'o."status" IN (\'CONFIRMED\', \'PROCESSING\', \'READY_FOR_PICKUP\', \'DELIVERED\')',
  ]) assert.ok(query.includes(predicate), predicate);
  assert.doesNotMatch(query, /providerCheckoutId|transactionId|p\."provider"/);
});

test("G2 uses a read-only repeatable-read snapshot, bounded reads and no public cache", () => {
  const query = source("lib/admin/dashboard/queries.ts");
  assert.match(query, /SET TRANSACTION READ ONLY/);
  assert.match(query, /TransactionIsolationLevel\.RepeatableRead/);
  assert.match(query, /take: 5/);
  assert.match(query, /LIMIT 5/);
  assert.doesNotMatch(query, /unstable_cache|revalidate|force-cache|cache:\s*["']public/);
  assert.doesNotMatch(query, /\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/);
  assert.doesNotMatch(query, /\$executeRawUnsafe|\$queryRawUnsafe|\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i);
  assert.ok(root);
});
