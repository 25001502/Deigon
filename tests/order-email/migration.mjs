// Fresh loopback PostgreSQL only. Never reads DATABASE_URL, DIRECT_URL or an env file.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";
import { after, before, test } from "node:test";

import { root } from "../admin-a/support/bundle.mjs";

const migration = "20261002000000_order_email_outbox";
const bin = process.env.DEIGON_TEST_PG_BIN || path.join(root, "node_modules/.cache/phase-5-postgres/package/native/bin");
const fixedTime = new Date("2026-10-02T08:00:00.000Z");
let pool;
let close;
let beforeBusinessRows;

function command(name, args) {
  return execFileSync(path.join(bin, name + (process.platform === "win32" ? ".exe" : "")), args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: name === "pg_ctl" ? "ignore" : "pipe",
  });
}

async function startDatabase() {
  const cache = path.join(root, "node_modules/.cache/order-email-b1");
  mkdirSync(cache, { recursive: true });
  const run = mkdtempSync(path.join(cache, "run-"));
  const data = path.join(run, "data");
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  command("initdb", ["-D", data, "-U", "orderemailb1", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  command("pg_ctl", ["-D", data, "-l", path.join(run, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  const result = new pg.Pool({ host: "127.0.0.1", port, user: "orderemailb1", database: "postgres", ssl: false });
  return {
    pool: result,
    close: async () => {
      try { await result.end(); } finally { command("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]); }
    },
  };
}

async function businessRows() {
  const rows = {};
  for (const table of ["User", "Order", "OrderItem", "Payment"]) {
    rows[table] = (await pool.query(`SELECT * FROM "${table}" ORDER BY id`)).rows;
  }
  return rows;
}

async function insertOutbox(overrides = {}) {
  const value = {
    id: "outbox-default",
    eventType: "ORDER_CONFIRMED",
    status: "PENDING",
    recipientEmail: "snapshot@example.invalid",
    recipientName: "Snapshot Customer",
    templateVersion: 1,
    payload: {},
    renderedSubject: null,
    renderedHtml: null,
    renderedText: null,
    attemptCount: 0,
    nextAttemptAt: fixedTime,
    claimedAt: null,
    claimToken: null,
    lastAttemptAt: null,
    sentAt: null,
    providerMessageId: null,
    lastErrorCode: null,
    lastError: null,
    createdAt: fixedTime,
    updatedAt: fixedTime,
    orderId: "email-existing-order",
    ...overrides,
  };
  return pool.query(`
    INSERT INTO "OrderEmailOutbox" (
      id,"eventType",status,"recipientEmail","recipientName","templateVersion",payload,
      "renderedSubject","renderedHtml","renderedText",
      "attemptCount","nextAttemptAt","claimedAt","claimToken","lastAttemptAt","sentAt",
      "providerMessageId","lastErrorCode","lastError","createdAt","updatedAt","orderId"
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
    ) RETURNING id
  `, [
    value.id, value.eventType, value.status, value.recipientEmail, value.recipientName,
    value.templateVersion, JSON.stringify(value.payload), value.renderedSubject, value.renderedHtml,
    value.renderedText, value.attemptCount, value.nextAttemptAt, value.claimedAt, value.claimToken,
    value.lastAttemptAt, value.sentAt, value.providerMessageId, value.lastErrorCode, value.lastError,
    value.createdAt, value.updatedAt, value.orderId,
  ]);
}

before(async () => {
  const handle = await startDatabase();
  pool = handle.pool;
  close = handle.close;
  await pool.query('CREATE SCHEMA auth; CREATE TABLE auth.users (id TEXT, email TEXT, raw_user_meta_data JSONB)');
  const migrations = readdirSync(path.join(root, "prisma/migrations")).filter((name) => /^\d/.test(name)).sort();
  const index = migrations.indexOf(migration);
  assert.notEqual(index, -1);
  assert.equal(index, migrations.length - 1, "B1 migration must be the latest migration");
  for (const name of migrations.slice(0, index)) {
    await pool.query(readFileSync(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
  }
  await pool.query(`
    INSERT INTO "User" (id,email,"updatedAt")
    VALUES ('email-user','email-user@example.invalid',NOW());

    INSERT INTO "Order" (
      id,"orderNumber","idempotencyKey",status,"fulfilmentType",subtotal,"shippingFee",total,
      "paymentStatus","customerName","customerEmail","shippingAddressLine1","shippingCity",
      "shippingProvince","shippingPostalCode","shippingCountry","userId","updatedAt","confirmedAt"
    ) VALUES
      ('email-existing-order','EMAIL-EXISTING','email-existing','CONFIRMED','DELIVERY',250.00,80.00,330.00,
       'PAID','Snapshot Customer','snapshot@example.invalid','1 Snapshot Street','Johannesburg',
       'Gauteng','2000','South Africa','email-user',NOW(),'2026-10-02T08:01:00.000Z'),
      ('email-state-order','EMAIL-STATE','email-state','CONFIRMED','PICKUP',250.00,0.00,250.00,
       'PAID','State Customer','state@example.invalid',NULL,NULL,NULL,NULL,NULL,'email-user',NOW(),'2026-10-02T08:01:00.000Z'),
      ('email-provider-order','EMAIL-PROVIDER','email-provider','CONFIRMED','DELIVERY',250.00,80.00,330.00,
       'PAID','Provider Customer','provider@example.invalid','2 Snapshot Street','Johannesburg',
       'Gauteng','2000','South Africa','email-user',NOW(),'2026-10-02T08:01:00.000Z'),
      ('email-restrict-order','EMAIL-RESTRICT','email-restrict','CONFIRMED','PICKUP',250.00,0.00,250.00,
       'PAID','Restrict Customer','restrict@example.invalid',NULL,NULL,NULL,NULL,NULL,'email-user',NOW(),'2026-10-02T08:01:00.000Z');

    INSERT INTO "OrderItem" (id,quantity,"unitPrice","lineTotal",title,sku,size,color,"imageUrl","orderId")
    VALUES ('email-existing-item',2,125.00,250.00,'Historical title','HISTORICAL-SKU','M','Black','/historical.jpg','email-existing-order');

    INSERT INTO "Payment" (id,amount,status,provider,"transactionId","updatedAt","orderId")
    VALUES ('email-existing-payment',330.00,'PAID','YOCO','historical-payment',NOW(),'email-existing-order');
  `);
  beforeBusinessRows = await businessRows();
  await pool.query(readFileSync(path.join(root, "prisma/migrations", migration, "migration.sql"), "utf8"));
});

after(async () => { await close?.(); });

test("real migration preserves existing business rows and creates no historical events", async () => {
  assert.deepEqual(await businessRows(), beforeBusinessRows);
  assert.equal((await pool.query('SELECT COUNT(*)::int count FROM "OrderEmailOutbox"')).rows[0].count, 0);
});

test("real migration creates approved enum values, columns, checks, indexes and RESTRICT FK", async () => {
  const enumRows = (await pool.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE t.typname IN ('OrderEmailEventType','OrderEmailStatus')
    ORDER BY t.typname,e.enumsortorder
  `)).rows;
  assert.deepEqual(enumRows, [
    { typname: "OrderEmailEventType", enumlabel: "ORDER_CONFIRMED" },
    { typname: "OrderEmailEventType", enumlabel: "ORDER_PROCESSING" },
    { typname: "OrderEmailEventType", enumlabel: "ORDER_SHIPPED" },
    { typname: "OrderEmailEventType", enumlabel: "ORDER_READY_FOR_PICKUP" },
    { typname: "OrderEmailEventType", enumlabel: "ORDER_COMPLETED" },
    { typname: "OrderEmailStatus", enumlabel: "PENDING" },
    { typname: "OrderEmailStatus", enumlabel: "SENDING" },
    { typname: "OrderEmailStatus", enumlabel: "SENT" },
    { typname: "OrderEmailStatus", enumlabel: "DEAD" },
  ]);
  const constraints = JSON.stringify((await pool.query(`SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='"OrderEmailOutbox"'::regclass ORDER BY conname`)).rows);
  const indexes = JSON.stringify((await pool.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='OrderEmailOutbox' ORDER BY indexname`)).rows);
  for (const name of [
    "OrderEmailOutbox_attempt_count_nonnegative_check", "OrderEmailOutbox_template_version_positive_check",
    "OrderEmailOutbox_rendered_content_complete_check", "OrderEmailOutbox_sending_claim_check",
    "OrderEmailOutbox_sent_provider_check", "OrderEmailOutbox_orderId_fkey",
  ]) assert.ok(constraints.includes(name), name);
  assert.ok(constraints.includes("ON DELETE RESTRICT"));
  for (const name of [
    "OrderEmailOutbox_providerMessageId_key", "OrderEmailOutbox_orderId_eventType_key",
    "OrderEmailOutbox_status_nextAttemptAt_createdAt_idx", "OrderEmailOutbox_status_claimedAt_idx",
  ]) assert.ok(indexes.includes(name), name);
});

test("database permanently deduplicates order and event while allowing another event", async () => {
  await insertOutbox({ id: "dedupe-confirmed", eventType: "ORDER_CONFIRMED" });
  await assert.rejects(insertOutbox({ id: "dedupe-confirmed-again", eventType: "ORDER_CONFIRMED" }), { code: "23505" });
  await insertOutbox({ id: "dedupe-processing", eventType: "ORDER_PROCESSING" });
});

test("database enforces provider message identity uniqueness", async () => {
  const sent = { status: "SENT", sentAt: fixedTime, providerMessageId: "provider-message-1", orderId: "email-provider-order" };
  await insertOutbox({ ...sent, id: "provider-first", eventType: "ORDER_SHIPPED" });
  await assert.rejects(insertOutbox({ ...sent, id: "provider-second", eventType: "ORDER_COMPLETED" }), { code: "23505" });
});

test("database rejects invalid counters, versions and incomplete active states", async () => {
  for (const value of [
    { id: "invalid-attempt", attemptCount: -1 },
    { id: "invalid-version", templateVersion: 0 },
    { id: "invalid-sending", status: "SENDING" },
    { id: "invalid-sent", status: "SENT" },
  ]) await assert.rejects(insertOutbox({ ...value, orderId: "email-state-order" }), { code: "23514" });
});

test("database requires persisted rendered content to be all null or all present", async () => {
  await assert.rejects(insertOutbox({
    id: "invalid-rendered-partial",
    orderId: "email-state-order",
    renderedSubject: "Subject only",
  }), { code: "23514" });
  await insertOutbox({
    id: "valid-rendered-complete",
    orderId: "email-state-order",
    renderedSubject: "Subject",
    renderedHtml: "<p>Body</p>",
    renderedText: "Body",
  });
  await pool.query('DELETE FROM "OrderEmailOutbox" WHERE id=$1', ["valid-rendered-complete"]);
});

test("database accepts valid PENDING, SENDING, SENT and DEAD states", async () => {
  const orderId = "email-state-order";
  await insertOutbox({ id: "state-pending", eventType: "ORDER_CONFIRMED", orderId });
  await insertOutbox({ id: "state-sending", eventType: "ORDER_PROCESSING", status: "SENDING", claimedAt: fixedTime, claimToken: "claim-1", orderId });
  await insertOutbox({ id: "state-sent", eventType: "ORDER_SHIPPED", status: "SENT", sentAt: fixedTime, providerMessageId: "provider-state-sent", orderId });
  await insertOutbox({ id: "state-dead", eventType: "ORDER_READY_FOR_PICKUP", status: "DEAD", attemptCount: 8, lastAttemptAt: fixedTime, lastErrorCode: "INVALID_RECIPIENT", lastError: "Recipient rejected", orderId });
  await insertOutbox({ id: "state-recoverable", eventType: "ORDER_COMPLETED", status: "PENDING", claimedAt: fixedTime, claimToken: "stale-claim", orderId });
  assert.equal((await pool.query('SELECT COUNT(*)::int count FROM "OrderEmailOutbox" WHERE "orderId"=$1', [orderId])).rows[0].count, 5);
});

test("outbox history prevents deletion of its referenced order", async () => {
  await insertOutbox({ id: "restrict-event", orderId: "email-restrict-order" });
  await assert.rejects(pool.query('DELETE FROM "Order" WHERE id=$1', ["email-restrict-order"]), { code: "23503" });
  assert.equal((await pool.query('SELECT COUNT(*)::int count FROM "Order" WHERE id=$1', ["email-restrict-order"])).rows[0].count, 1);
});
