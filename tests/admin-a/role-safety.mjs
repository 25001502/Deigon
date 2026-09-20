// Real SQL trigger and documentation transactions, only in a new loopback cluster.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";
import pg from "pg";
import { root } from "./support/bundle.mjs";

const bin = process.env.DEIGON_TEST_PG_BIN || path.join(root, "node_modules/.cache/phase-5-postgres/package/native/bin");
const executable = name => path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const read = file => readFileSync(path.join(root, file), "utf8");
const operations = read("docs/admin-access.md");
let database;
let dataDir;
let started = false;

function command(file, args) {
  return execFileSync(file, args, { cwd: root, encoding: "utf8", windowsHide: true,
    stdio: path.basename(file).startsWith("pg_ctl") ? "ignore" : "pipe" });
}

before(async () => {
  const cache = path.join(root, "node_modules/.cache/admin-a-tests");
  mkdirSync(cache, { recursive: true });
  const runDir = mkdtempSync(path.join(cache, "run-"));
  dataDir = path.join(runDir, "data");
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  command(executable("initdb"), ["-D", dataDir, "-U", "admin_a_test", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  command(executable("pg_ctl"), ["-D", dataDir, "-l", path.join(runDir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  // Never accepts DATABASE_URL / DIRECT_URL, and never loads .env files.
  database = new pg.Client({ host: "127.0.0.1", port, user: "admin_a_test", database: "postgres", ssl: false });
  await database.connect();
  await database.query(`CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL, raw_user_meta_data jsonb);
    CREATE ROLE anon; CREATE ROLE authenticated;`);
  await database.query(read("prisma/migrations/20260818084401_init/migration.sql"));
  await database.query(read("prisma/migrations/20260818124000_add_user_phone/migration.sql"));
  await database.query(read("prisma/migrations/20260818100200_supabase_user_sync_trigger/migration.sql"));
});

after(async () => {
  try { if (database) await database.end(); }
  finally { if (started) command(executable("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"]); }
});

async function fixture(metadata = { role: "ADMIN", full_name: "Test Customer" }) {
  const id = randomUUID();
  const email = `${id}@example.invalid`;
  await database.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)", [id, email, metadata]);
  return { id, email };
}

function operation(kind, account) {
  const marker = `<!-- ${kind}-sql -->`;
  const section = operations.slice(operations.indexOf(marker) + marker.length);
  const match = section.match(/```sql\r?\n([\s\S]*?)```/);
  assert.ok(match, "Documented SQL block exists");
  return match[1]
    .replace("expected_id uuid := '00000000-0000-0000-0000-000000000000'", `expected_id uuid := '${account.id}'`)
    .replace("expected_email text := 'replace-me@example.invalid'", `expected_email text := '${account.email}'`);
}

async function profile(id) { return (await database.query('SELECT * FROM public."User" WHERE id = $1', [id])).rows[0]; }
async function rejected(sql, pattern) {
  try { await assert.rejects(database.query(sql), pattern); }
  finally { await database.query("ROLLBACK"); }
}

test("real auth.users trigger ignores requested ADMIN metadata and creates CUSTOMER with same UUID", async () => {
  const user = await fixture();
  const record = await profile(user.id);
  assert.equal(record.id, user.id);
  assert.equal(record.email, user.email);
  assert.equal(record.role, "CUSTOMER");
  assert.equal(record.name, "Test Customer");
});

test("documented promotion changes only one verified profile's role/updatedAt and preserves relationships", async () => {
  const user = await fixture();
  const other = await fixture();
  const before = await profile(user.id);
  const otherBefore = await profile(other.id);
  const cartId = randomUUID();
  const addressId = randomUUID();
  await database.query('INSERT INTO "Cart" (id, "userId", "updatedAt") VALUES ($1, $2, NOW())', [cartId, user.id]);
  await database.query('INSERT INTO "Address" (id, "fullName", "addressLine1", city, province, "postalCode", "userId") VALUES ($1, $2, $3, $4, $5, $6, $7)', [addressId, "Test", "Test", "Test", "Test", "0000", user.id]);
  await database.query(operation("promotion", user));
  const promoted = await profile(user.id);
  assert.equal(promoted.role, "ADMIN");
  const unchanged = record => Object.fromEntries(Object.entries(record).filter(([key]) => !["role", "updatedAt"].includes(key)));
  assert.deepEqual(unchanged(promoted), unchanged(before));
  assert.deepEqual(await profile(other.id), otherBefore);
  assert.equal((await database.query('SELECT "userId" FROM "Cart" WHERE id = $1', [cartId])).rows[0].userId, user.id);
  assert.equal((await database.query('SELECT "userId" FROM "Address" WHERE id = $1', [addressId])).rows[0].userId, user.id);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM "User" WHERE role = \'ADMIN\' AND id = $1', [user.id])).rows[0].n, 1);
});

test("promotion fails for wrong Auth email or UUID and leaves profiles untouched", async () => {
  const user = await fixture();
  const before = await profile(user.id);
  await rejected(operation("promotion", { ...user, email: "wrong@example.invalid" }), /Auth account email does not match/);
  await rejected(operation("promotion", { ...user, id: randomUUID() }), /query returned no rows/);
  assert.deepEqual(await profile(user.id), before);
});

test("promotion fails for missing or mismatched profile", async () => {
  const user = await fixture();
  await database.query('UPDATE "User" SET email = $2 WHERE id = $1', [user.id, `${randomUUID()}@example.invalid`]);
  await rejected(operation("promotion", user), /Profile identity or current role does not match/);
  assert.equal((await profile(user.id)).role, "CUSTOMER");
  await database.query('DELETE FROM "User" WHERE id = $1', [user.id]);
  await rejected(operation("promotion", user), /query returned no rows/);
  assert.equal(await profile(user.id), undefined);
});

test("promotion requires CUSTOMER and demotion requires ADMIN", async () => {
  const user = await fixture();
  await rejected(operation("demotion", user), /Profile identity or current role does not match/);
  await database.query(operation("promotion", user));
  const promoted = await profile(user.id);
  await rejected(operation("promotion", user), /Profile identity or current role does not match/);
  assert.deepEqual(await profile(user.id), promoted);
  await database.query(operation("demotion", user));
  assert.equal((await profile(user.id)).role, "CUSTOMER");
});

test("demotion rejects wrong identity without changing the admin", async () => {
  const user = await fixture();
  await database.query(operation("promotion", user));
  const before = await profile(user.id);
  await rejected(operation("demotion", { ...user, email: "wrong@example.invalid" }), /Auth account email does not match/);
  assert.deepEqual(await profile(user.id), before);
});

test("unchanged documentation placeholders fail closed", async () => {
  await rejected(operation("promotion", { id: "00000000-0000-0000-0000-000000000000", email: "replace-me@example.invalid" }), /Replace and verify/);
});

test("read-only security inspection SQL executes without modifying fixture data", async () => {
  const docs = read("docs/supabase-role-security.md");
  const before = (await database.query('SELECT * FROM "User" ORDER BY id')).rows;
  const blocks = [...docs.matchAll(/```sql\r?\n([\s\S]*?)```/g)];
  assert.equal(blocks.length, 3);
  for (const [, sql] of blocks) {
    assert.match(sql, /^BEGIN TRANSACTION READ ONLY;/);
    await database.query(sql);
  }
  assert.deepEqual((await database.query('SELECT * FROM "User" ORDER BY id')).rows, before);
});
