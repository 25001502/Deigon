import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";
import { after, before, test } from "node:test";

import { root } from "../admin-a/support/bundle.mjs";

const migration = "20260926000000_admin_sale_pricing_foundation";
const bin = process.env.DEIGON_TEST_PG_BIN || path.join(root, "node_modules/.cache/phase-5-postgres/package/native/bin");
let pool;
let close;
let variantId = "admin-f-existing-variant";

function command(name, args) {
  return execFileSync(path.join(bin, name + (process.platform === "win32" ? ".exe" : "")), args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: name === "pg_ctl" ? "ignore" : "pipe",
  });
}

async function startDatabase() {
  const cache = path.join(root, "node_modules/.cache/admin-f");
  mkdirSync(cache, { recursive: true });
  const run = mkdtempSync(path.join(cache, "run-"));
  const data = path.join(run, "data");
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  command("initdb", ["-D", data, "-U", "adminf", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  command("pg_ctl", ["-D", data, "-l", path.join(run, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  const result = new pg.Pool({ host: "127.0.0.1", port, user: "adminf", database: "postgres", ssl: false });
  return {
    pool: result,
    close: async () => {
      try { await result.end(); } finally { command("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]); }
    },
  };
}

before(async () => {
  const handle = await startDatabase();
  pool = handle.pool;
  close = handle.close;
  await pool.query('CREATE SCHEMA auth; CREATE TABLE auth.users (id TEXT, email TEXT, raw_user_meta_data JSONB)');
  const migrations = readdirSync(path.join(root, "prisma/migrations")).filter((name) => /^\d/.test(name)).sort();
  const index = migrations.indexOf(migration);
  assert.notEqual(index, -1);
  for (const name of migrations.slice(0, index)) {
    await pool.query(readFileSync(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await pool.query(`
    INSERT INTO "Category" (id,name,slug,"updatedAt") VALUES ('admin-f-category','Admin F Category','admin-f-category',NOW());
    INSERT INTO "Product" (id,name,slug,"categoryId","updatedAt") VALUES ('admin-f-product','Admin F Product','admin-f-product','admin-f-category',NOW());
    INSERT INTO "ProductVariant" (id,sku,price,"productId","updatedAt") VALUES ('${variantId}','ADMIN-F-EXISTING',1500.00,'admin-f-product',NOW());
    INSERT INTO "Inventory" (id,quantity,"variantId","updatedAt") VALUES ('admin-f-inventory',5,'${variantId}',NOW());
  `);
  await pool.query(readFileSync(path.join(root, "prisma/migrations", migration, "migration.sql"), "utf8"));
});

after(async () => { await close?.(); });

test("full prior history and the F2 migration preserve existing variants with null sale fields", async () => {
  const row = (await pool.query('SELECT "salePrice","saleStartsAt","saleEndsAt" FROM "ProductVariant" WHERE id=$1', [variantId])).rows[0];
  assert.deepEqual(row, { salePrice: null, saleStartsAt: null, saleEndsAt: null });
  const columns = (await pool.query(`SELECT column_name,data_type,datetime_precision FROM information_schema.columns WHERE table_name='ProductVariant' AND column_name IN ('salePrice','saleStartsAt','saleEndsAt') ORDER BY column_name`)).rows;
  assert.deepEqual(columns, [
    { column_name: "saleEndsAt", data_type: "timestamp with time zone", datetime_precision: 3 },
    { column_name: "salePrice", data_type: "numeric", datetime_precision: null },
    { column_name: "saleStartsAt", data_type: "timestamp with time zone", datetime_precision: 3 },
  ]);
});

test("valid immediate, bounded, start-only and end-only sales persist", async () => {
  await pool.query('UPDATE "ProductVariant" SET "salePrice"=1200.50,"saleStartsAt"=NULL,"saleEndsAt"=NULL WHERE id=$1', [variantId]);
  await pool.query('UPDATE "ProductVariant" SET "salePrice"=1200.50,"saleStartsAt"=$1,"saleEndsAt"=$2 WHERE id=$3', ["2026-09-26T12:00:00.000Z", "2026-09-26T14:00:00.000Z", variantId]);
  await pool.query('UPDATE "ProductVariant" SET "salePrice"=1200.50,"saleStartsAt"=$1,"saleEndsAt"=NULL WHERE id=$2', ["2026-09-26T12:00:00.000Z", variantId]);
  await pool.query('UPDATE "ProductVariant" SET "salePrice"=1200.50,"saleStartsAt"=NULL,"saleEndsAt"=$1 WHERE id=$2', ["2026-09-26T14:00:00.000Z", variantId]);
});

for (const [name, statement, values] of [
  ["non-positive sale price", 'UPDATE "ProductVariant" SET "salePrice"=$1 WHERE id=$2', [0, variantId]],
  ["sale price equal to base", 'UPDATE "ProductVariant" SET "salePrice"=$1 WHERE id=$2', [1500, variantId]],
  ["sale price above base", 'UPDATE "ProductVariant" SET "salePrice"=$1 WHERE id=$2', [1500.01, variantId]],
  ["schedule without sale", 'UPDATE "ProductVariant" SET "salePrice"=NULL,"saleStartsAt"=$1,"saleEndsAt"=NULL WHERE id=$2', ["2026-09-26T12:00:00.000Z", variantId]],
  ["equal schedule boundaries", 'UPDATE "ProductVariant" SET "salePrice"=1200,"saleStartsAt"=$1,"saleEndsAt"=$1 WHERE id=$2', ["2026-09-26T12:00:00.000Z", variantId]],
  ["reversed schedule boundaries", 'UPDATE "ProductVariant" SET "salePrice"=1200,"saleStartsAt"=$1,"saleEndsAt"=$2 WHERE id=$3', ["2026-09-26T14:00:00.000Z", "2026-09-26T12:00:00.000Z", variantId]],
]) {
  test(`database rejects ${name}`, async () => {
    await assert.rejects(pool.query(statement, values), { code: "23514" });
  });
}

test("a failed constraint mutation rolls back cleanly", async () => {
  await pool.query('UPDATE "ProductVariant" SET price=1500,"salePrice"=1200,"saleStartsAt"=NULL,"saleEndsAt"=NULL WHERE id=$1', [variantId]);
  await assert.rejects(pool.query('UPDATE "ProductVariant" SET price=1100 WHERE id=$1', [variantId]), { code: "23514" });
  const row = (await pool.query('SELECT price,"salePrice" FROM "ProductVariant" WHERE id=$1', [variantId])).rows[0];
  assert.deepEqual(row, { price: "1500.00", salePrice: "1200.00" });
});

test("existing catalogue, inventory, order and payment constraints remain present", async () => {
  const constraints = JSON.stringify((await pool.query(`SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname`)).rows);
  const indexes = JSON.stringify((await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname`)).rows);
  for (const name of ["Inventory_quantity_nonnegative_check", "Order_idempotencyKey_key", "Payment_orderId_key", "ProductVariant_sku_key"]) {
    assert.ok(constraints.includes(name) || indexes.includes(name), name);
  }
  await assert.rejects(pool.query('UPDATE "Inventory" SET quantity=-1 WHERE "variantId"=$1', [variantId]), { code: "23514" });
});
