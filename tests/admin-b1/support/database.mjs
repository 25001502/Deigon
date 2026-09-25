import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { root } from "../../admin-a/support/bundle.mjs";

export const newFields = ["processingAt", "shippedAt", "readyForPickupAt", "deliveredAt", "estimatedDeliveryDate"];
const migration = "20260920000000_admin_order_fulfilment";
const bin = process.env.DEIGON_TEST_PG_BIN || path.join(root, "node_modules/.cache/phase-5-postgres/package/native/bin");
function command(name, args) {
  return execFileSync(path.join(bin, name + (process.platform === "win32" ? ".exe" : "")), args, {
    cwd: root, encoding: "utf8", windowsHide: true, stdio: name === "pg_ctl" ? "ignore" : "pipe",
  });
}

export async function database() {
  const cache = path.join(root, "node_modules/.cache/admin-b1");
  mkdirSync(cache, { recursive: true });
  const run = mkdtempSync(path.join(cache, "run-"));
  const data = path.join(run, "data");
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const connection = { host: "127.0.0.1", port, user: "adminb1", database: "postgres", ssl: false };
  command("initdb", ["-D", data, "-U", "adminb1", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  command("pg_ctl", ["-D", data, "-l", path.join(run, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  const pool = new pg.Pool(connection);
  const db = new PrismaClient({ adapter: new PrismaPg(connection) });
  const close = async () => {
    try { await db.$disconnect(); } finally {
      try { await pool.end(); } finally { command("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]); }
    }
  };
  try {
    await pool.query('CREATE SCHEMA auth; CREATE TABLE auth.users (id TEXT, email TEXT, raw_user_meta_data JSONB)');
    const migrations = readdirSync(path.join(root, "prisma/migrations")).filter((name) => /^\d/.test(name)).sort();
    const migrationIndex = migrations.indexOf(migration);
    assert.notEqual(migrationIndex, -1);
    for (const name of migrations.slice(0, migrationIndex)) {
      await pool.query(readFileSync(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
    }
    // Seed with SQL because the regenerated client expects the five not-yet-added columns.
    await pool.query(`INSERT INTO "User" (id,email,"updatedAt") VALUES ('migration-user','migration@example.invalid',NOW());
      INSERT INTO "Order" (id,"orderNumber","idempotencyKey",status,"fulfilmentType",subtotal,"shippingFee",total,"paymentStatus","customerName","customerEmail","userId","updatedAt","confirmedAt")
      VALUES ('migration-pending','MIGRATION-PENDING','migration-pending','PENDING','DELIVERY',200.25,50.50,250.75,'PENDING','Snapshot','snapshot@example.invalid','migration-user',NOW(),NULL),
      ('migration-confirmed','MIGRATION-CONFIRMED','migration-confirmed','CONFIRMED','PICKUP',200.25,0,200.25,'PAID','Snapshot','snapshot@example.invalid','migration-user',NOW(),'2026-01-01');
      INSERT INTO "Payment" (id,amount,status,provider,"updatedAt","orderId") VALUES
      ('migration-payment-pending',250.75,'PENDING','YOCO',NOW(),'migration-pending'),
      ('migration-payment-paid',200.25,'PAID','YOCO',NOW(),'migration-confirmed');`);
    const rows = async (sql) => (await pool.query(sql)).rows;
    const beforeOrders = await rows('SELECT * FROM "Order" ORDER BY id');
    const beforePayments = await rows('SELECT * FROM "Payment" ORDER BY id');
    const columnsSql = `SELECT table_name,column_name,data_type,is_nullable,column_default,datetime_precision
      FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`;
    const constraintsSql = `SELECT conrelid::regclass::text AS relation,conname,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY relation,conname`;
    const indexesSql = `SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`;
    const beforeColumns = await rows(columnsSql);
    const beforeConstraints = await rows(constraintsSql);
    const beforeIndexes = await rows(indexesSql);
    const sql = readFileSync(path.join(root, "prisma/migrations", migration, "migration.sql"), "utf8");
    assert.match(sql, /^ALTER TABLE "Order"/);
    assert.equal((sql.match(/ADD COLUMN/g) ?? []).length, 5);
    assert.doesNotMatch(sql, /DEFAULT|NOT NULL|DROP|UPDATE|DELETE|INSERT|CREATE|INDEX/i);
    await pool.query(sql);
    const afterOrders = await rows('SELECT * FROM "Order" ORDER BY id');
    for (const row of afterOrders) for (const field of newFields) { assert.equal(row[field], null); delete row[field]; }
    assert.deepEqual(afterOrders, beforeOrders);
    assert.deepEqual(await rows('SELECT * FROM "Payment" ORDER BY id'), beforePayments);
    assert.deepEqual(await rows(constraintsSql), beforeConstraints);
    assert.deepEqual(await rows(indexesSql), beforeIndexes);
    const afterColumns = await rows(columnsSql);
    const addedColumns = afterColumns.filter((column) => column.table_name === "Order" && newFields.includes(column.column_name));
    assert.equal(addedColumns.length, 5);
    for (const column of addedColumns) {
      assert.equal(column.is_nullable, "YES"); assert.equal(column.column_default, null);
      assert.equal(column.data_type, column.column_name === "estimatedDeliveryDate" ? "date" : "timestamp without time zone");
      if (column.column_name !== "estimatedDeliveryDate") assert.equal(column.datetime_precision, 3);
    }
    assert.deepEqual(afterColumns.filter((column) => !addedColumns.includes(column)), beforeColumns);
    // Real constraints still reject invalid commerce records after migration.
    await assert.rejects(pool.query('UPDATE "Order" SET "userId"=$1 WHERE id=$2', ['missing-user', 'migration-pending']), { code: "23503" });
    await assert.rejects(pool.query('UPDATE "Order" SET "idempotencyKey"=$1 WHERE id=$2', ['migration-confirmed', 'migration-pending']), { code: "23505" });
    // Later additive migrations are applied only after the B1 before/after assertions above.
    for (const name of migrations.slice(migrationIndex + 1)) {
      await pool.query(readFileSync(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
    }
    return { db, pool, close, migrationVerified: true, url: `postgresql://adminb1@127.0.0.1:${port}/postgres?sslmode=disable` };
  } catch (error) { await close(); throw error; }
}
