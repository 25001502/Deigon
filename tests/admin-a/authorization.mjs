// Run: node --test tests/admin-a/authorization.mjs
// Real requireUser/requireAdmin/page guards; only Supabase and DB boundaries replaced.
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { bundle } from "./support/bundle.mjs";

let state;
const app = await bundle(`
  export { requireAdmin } from './lib/auth/require-admin';
  export { requireAdminPage } from './lib/auth/require-admin-page';
  export { GET as ping } from './app/api/admin/ping/route';
  export { PATCH as profile } from './app/api/account/profile/route';
  export { POST as createProduct } from './app/api/products/route';
  export { PATCH as updateProduct, DELETE as deleteProduct } from './app/api/products/[id]/route';
  export { default as login } from './app/admin/login/page';
  export { default as layout } from './app/admin/(protected)/layout';
  export { default as dashboard } from './app/admin/(protected)/page';
  export { default as orders } from './app/admin/(protected)/orders/page';
  export { default as products } from './app/admin/(protected)/products/page';
  export { default as inventory } from './app/admin/(protected)/inventory/page';
  export { dynamic } from './app/admin/layout';
`, {
  "server-only": "",
  "@/lib/supabase/server": `export const createClient = async () => ({ auth: { getUser: () => globalThis.__adminAuth.getUser() } });`,
  "@/lib/prisma": `export const prisma = { user: {
    findUnique: args => globalThis.__adminAuth.findUnique(args),
    update: args => globalThis.__adminAuth.update(args),
  } };`,
  "next/navigation": `export function redirect(url) { const e = new Error('NEXT_REDIRECT'); e.location = url; throw e; }`,
  "next/link": `export default function Link({ children, ...props }) { return <a {...props}>{children}</a>; }`,
  "@/components/admin/admin-login-form": `export function AdminLoginForm() { return <form aria-label="Admin sign in" />; }`,
  "@/components/admin/admin-session-controls": `export function AdminSessionControls() { return <button>Sign out / switch account</button>; }`,
  "@/components/admin/admin-shell": `export function AdminShell({ children }) { return <main>{children}</main>; }`,
});

beforeEach(() => {
  state = {
    user: { id: "verified-user", email: "admin@example.invalid" }, role: "CUSTOMER",
    authError: null, databaseError: null, queries: [], writes: [], verified: 0,
    async getUser() { this.verified++; return { data: { user: this.user }, error: this.authError }; },
    async findUnique(args) {
      this.queries.push(args);
      if (this.databaseError) throw this.databaseError;
      return this.role === null ? null : { role: this.role };
    },
    async update(args) { this.writes.push(args); return { id: this.user.id, role: this.role, ...args.data }; },
  };
  globalThis.__adminAuth = state;
});
afterEach(() => { delete globalThis.__adminAuth; mock.restoreAll(); });

const redirectsTo = (url) => (error) => error.location === url;
const protectedPages = ["dashboard", "orders", "products", "inventory"];
async function checkProtected(url) {
  for (const key of protectedPages) await assert.rejects(app[key](), redirectsTo(url));
  await assert.rejects(app.layout({ children: "protected content" }), redirectsTo(url));
}

test("unauthenticated callers are redirected before any role lookup on every page/layout", async () => {
  state.user = null;
  await checkProtected("/admin/login");
  assert.equal(state.queries.length, 0);
});

test("invalid and expired verified sessions cannot reach admin even with a user object", async () => {
  for (const message of ["invalid token", "expired token"]) {
    state.authError = new Error(message);
    state.role = "ADMIN";
    await checkProtected("/admin/login");
  }
  assert.equal(state.queries.length, 0);
});

test("CUSTOMER and missing public profiles are denied on every protected page/layout", async () => {
  for (const role of ["CUSTOMER", null]) {
    state.role = role;
    await checkProtected("/admin/login?access=denied");
  }
  assert.equal(state.writes.length, 0);
});

test("ADMIN is authorized using only the Supabase-verified UUID and server role lookup", async () => {
  state.role = "ADMIN";
  assert.deepEqual(await app.requireAdmin(), { ...state.user, role: "ADMIN" });
  assert.equal(state.verified, 1);
  assert.deepEqual(state.queries, [{ where: { id: "verified-user" }, select: { role: true } }]);
  for (const key of protectedPages) assert.ok(await app[key]());
  assert.ok(await app.layout({ children: "authorized" }));
  assert.equal(app.dynamic, "force-dynamic");
});

test("database failures propagate without returning protected content or masking as login", async () => {
  state.databaseError = new Error("database private details");
  for (const key of [...protectedPages, "login"]) await assert.rejects(app[key](), /database private details/);
  await assert.rejects(app.layout({ children: "secret" }), /database private details/);
});

test("demotion blocks the next page and API request with fresh role reads", async () => {
  state.role = "ADMIN";
  await app.requireAdminPage();
  assert.equal((await app.ping()).status, 200);
  state.role = "CUSTOMER";
  await assert.rejects(app.requireAdminPage(), redirectsTo("/admin/login?access=denied"));
  assert.equal((await app.ping()).status, 403);
  assert.equal(state.queries.length, 4);
});

test("forged metadata, headers, and body never grant admin product mutation access", async () => {
  state.user.user_metadata = { role: "ADMIN" };
  state.user.app_metadata = { role: "ADMIN" };
  const request = () => new Request("https://shop.invalid/api/products", {
    method: "POST", headers: { "content-type": "application/json", "x-user-id": "other-admin", "x-role": "ADMIN", cookie: "role=ADMIN" },
    body: JSON.stringify({ userId: "other-admin", role: "ADMIN" }),
  });
  for (const handler of [app.createProduct, app.updateProduct, app.deleteProduct]) {
    const response = await handler(request(), { params: Promise.resolve({ id: "product" }) });
    assert.equal(response.status, 403);
  }
  await assert.rejects(app.requireAdminPage(), redirectsTo("/admin/login?access=denied"));
  assert.ok(state.queries.every(q => q.where.id === state.user.id));
  assert.equal(state.writes.length, 0);
});

test("ping maintains 401/403/200 and no-store for all identity states", async () => {
  for (const [user, role, status] of [[null, null, 401], [state.user, "CUSTOMER", 403], [state.user, null, 403], [state.user, "ADMIN", 200]]) {
    state.user = user; state.role = role;
    const response = await app.ping();
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    const body = await response.json();
    assert.equal(body.ok, status === 200);
    if (status !== 200) assert.ok(!("adminId" in body));
  }
});

test("ping masks unexpected failures and never caches them", async () => {
  mock.method(console, "error", () => {});
  state.databaseError = new Error("postgres://private-secret");
  const response = await app.ping();
  assert.equal(response.status, 500);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await response.json(), { ok: false, message: "Internal server error" });
});

test("login redirects ADMIN and preserves denied CUSTOMER/missing-profile sessions", async () => {
  state.role = "ADMIN";
  await assert.rejects(app.login(), redirectsTo("/admin"));
  for (const role of ["CUSTOMER", null]) {
    state.role = role;
    const html = renderToStaticMarkup(await app.login());
    assert.match(html, /Admin access required/);
    assert.match(html, /Return to customer account/);
    assert.match(html, /Sign out \/ switch account/);
    assert.doesNotMatch(html, /<form|signup/i);
  }
});

test("unauthenticated login renders sign in without a signup mechanism", async () => {
  state.user = null;
  const html = renderToStaticMarkup(await app.login());
  assert.match(html, /Admin sign in/);
  assert.doesNotMatch(html, /signup|register|role selector/i);
});

test("profile PATCH ignores attempted role/UUID/email escalation", async () => {
  const response = await app.profile(new Request("https://shop.invalid/api/account/profile", {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "other-user", role: "ADMIN", email: "other@example.invalid", name: "Updated" }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(state.writes[0].where, { id: "verified-user" });
  assert.deepEqual(state.writes[0].data, { name: "Updated" });
  assert.equal((await response.json()).profile.role, "CUSTOMER");
});

test("authorized admin pages expose only implemented tools and no invented business metrics", async () => {
  state.role = "ADMIN";
  for (const key of ["dashboard", "inventory"]) {
    const page = renderToStaticMarkup(await app[key]());
    assert.match(page, /future update|Coming soon/);
    assert.doesNotMatch(page, /<form|<button|<input|mark.*paid|revenue|R\s*\d/i);
  }
  const products = renderToStaticMarkup(await app.products());
  assert.match(products, /Catalogue management/);
  assert.match(products, /Search|Visibility|Featured|Category|Create product/);
  assert.doesNotMatch(products, /mark.*paid|revenue|provider|transaction|inventory quantity|sale price/i);
  const orders = renderToStaticMarkup(await app.orders());
  assert.match(orders, /Order management/);
  assert.match(orders, /Search orders/);
  assert.doesNotMatch(orders, /mark.*paid|revenue|providerCheckoutId|transactionId|idempotencyKey/i);
  assert.equal(state.writes.length, 0);
});
