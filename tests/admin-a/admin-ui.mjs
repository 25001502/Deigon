// Actual form handlers with isolated React hooks and Supabase/browser boundaries.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { bundle, find } from "./support/bundle.mjs";

const originals = { window: globalThis.window, FormData: globalThis.FormData };
let state;
const app = await bundle(`
  export { AdminLoginForm } from './components/admin/admin-login-form';
  export { AdminSessionControls } from './components/admin/admin-session-controls';
  export { AdminNavigation } from './components/admin/admin-navigation';
  export { AdminShell } from './components/admin/admin-shell';
  export { default as AdminError } from './app/admin/error';
  export { default as AdminLoading } from './app/admin/(protected)/loading';
  export { requireAdminPage } from './lib/auth/require-admin-page';
  export { default as loginPage } from './app/admin/login/page';
`, {
  "server-only": "",
  "react": `export const useState = value => globalThis.__adminUI.useState(value);
    export const useRef = value => globalThis.__adminUI.useRef(value);`,
  "next/link": `export default function Link({ children, prefetch: _prefetch, ...props }) { return <a {...props}>{children}</a>; }`,
  "next/navigation": `export const usePathname = () => globalThis.__adminUI.pathname;
    export function redirect(location) { const e = new Error('NEXT_REDIRECT'); e.location = location; throw e; }`,
  "@/lib/supabase/client": `export const createClient = () => ({ auth: {
    signInWithPassword: args => globalThis.__adminUI.signIn(args),
    signOut: () => globalThis.__adminUI.signOut(),
  } });`,
  "@/lib/supabase/server": `export const createClient = async () => ({ auth: {
    getUser: async () => ({ data: { user: globalThis.__adminUI.user }, error: null })
  } });`,
  "@/lib/prisma": `export const prisma = { user: { findUnique: async () => ({ role: globalThis.__adminUI.role }) } };`,
});

beforeEach(() => {
  const values = [];
  state = {
    cursor: 0, pathname: "/admin", events: [], user: null, role: "CUSTOMER",
    useState(initial) {
      const i = this.cursor++;
      if (!(i in values)) values[i] = initial;
      return [values[i], value => { values[i] = value; }];
    },
    useRef(initial) {
      const i = this.cursor++;
      if (!(i in values)) values[i] = { current: initial };
      return values[i];
    },
    async signIn(args) { this.events.push(["signin", args]); this.user = { id: "verified-user", email: args.email }; return { error: null }; },
    async signOut() { this.events.push(["signout"]); this.user = null; return { error: null }; },
  };
  globalThis.__adminUI = state;
  globalThis.window = { location: { assign: url => state.events.push(["navigate", url]) } };
  globalThis.FormData = class {
    get(key) { return { email: " admin@example.invalid ", password: " password spaces ", role: "ADMIN", next: "https://evil.example" }[key]; }
  };
});
afterEach(() => {
  delete globalThis.__adminUI;
  if (originals.window === undefined) delete globalThis.window;
  else globalThis.window = originals.window;
  globalThis.FormData = originals.FormData;
});

function render(component = app.AdminLoginForm, props = {}) { state.cursor = 0; return component(props); }
function submit() { return render().props.onSubmit({ preventDefault() {}, currentTarget: {} }); }
const button = node => find(node, n => n.type === "button");
const alert = node => find(node, n => n.props?.role === "alert");

test("login shows pending state and prevents duplicate submissions", async () => {
  let finish;
  let calls = 0;
  state.signIn = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const pending = submit();
  assert.equal(button(render()).props.disabled, true);
  assert.equal(render().props["aria-busy"], true);
  assert.equal(button(render()).props.children, "Signing in...");
  await submit();
  assert.equal(calls, 1);
  finish({ error: { message: "invalid" } });
  await pending;
  assert.equal(button(render()).props.disabled, false);
});

test("invalid credentials use controlled copy without provider internals or navigation", async () => {
  state.signIn = async () => ({ error: { message: "secret internal diagnostic" } });
  await submit();
  assert.match(alert(render()).props.children, /Check your email and password/);
  assert.doesNotMatch(alert(render()).props.children, /secret/);
  assert.equal(button(render()).props.disabled, false);
  assert.deepEqual(state.events, []);
});

test("login network failure is recoverable without exposing details", async () => {
  state.signIn = async () => { throw new Error("private network endpoint"); };
  await submit();
  assert.equal(alert(render()).props.children, "Unable to connect. Please try again.");
  assert.equal(button(render()).props.disabled, false);
});

test("ADMIN login sends only credentials then reaches a fresh protected server check", async () => {
  state.role = "ADMIN";
  await submit();
  assert.deepEqual(state.events, [
    ["signin", { email: "admin@example.invalid", password: " password spaces " }],
    ["navigate", "/admin"],
  ]);
  assert.equal((await app.requireAdminPage()).role, "ADMIN");
});

test("CUSTOMER login authenticates but reaches denied state without automatic signout", async () => {
  await submit();
  await assert.rejects(app.requireAdminPage(), e => e.location === "/admin/login?access=denied");
  const page = await app.loginPage();
  assert.ok(find(page, n => n.type === "h1" && n.props.children === "Admin access required"));
  assert.ok(state.user);
  assert.ok(state.events.every(([kind]) => kind !== "signout"));
});

test("login form exposes only email/password with accessible labels and no registration", () => {
  const html = renderToStaticMarkup(render());
  assert.match(html, /autocomplete="email"/i);
  assert.match(html, /autocomplete="current-password"/i);
  assert.equal((html.match(/<label/g) ?? []).length, 2);
  assert.doesNotMatch(html, /signup|register|name="role"|name="next"|<select/i);
});

test("successful logout signs out the shared session then navigates to fixed login", async () => {
  state.user = { id: "admin" };
  await button(render(app.AdminSessionControls)).props.onClick();
  assert.equal(state.user, null);
  assert.deepEqual(state.events, [["signout"], ["navigate", "/admin/login"]]);
});

test("logout pending state blocks duplicates and failure preserves the page", async () => {
  let finish;
  let calls = 0;
  state.signOut = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const pending = button(render(app.AdminSessionControls)).props.onClick();
  assert.equal(button(render(app.AdminSessionControls)).props.disabled, true);
  await button(render(app.AdminSessionControls)).props.onClick();
  assert.equal(calls, 1);
  finish({ error: { message: "internal detail" } });
  await pending;
  assert.equal(alert(render(app.AdminSessionControls)).props.children, "Unable to sign out. Please try again.");
  assert.equal(button(render(app.AdminSessionControls)).props.disabled, false);
  assert.deepEqual(state.events, []);
});

test("logout network failure is recoverable", async () => {
  state.signOut = async () => { throw new Error("private detail"); };
  await button(render(app.AdminSessionControls, { switchAccount: true })).props.onClick();
  assert.ok(alert(render(app.AdminSessionControls)));
  assert.equal(button(render(app.AdminSessionControls)).props.disabled, false);
  assert.deepEqual(state.events, []);
});

test("navigation indicates exactly the active route, supports nested routes, and disables prefetch", () => {
  for (const pathname of ["/admin", "/admin/orders", "/admin/products", "/admin/inventory", "/admin/orders/example"]) {
    state.pathname = pathname;
    const tree = app.AdminNavigation();
    const links = tree.props.children.props.children.map(li => li.props.children);
    assert.equal(links.length, 4);
    const active = links.filter(link => link.props["aria-current"] === "page");
    assert.equal(active.length, 1);
    assert.ok(pathname === active[0].props.href || pathname.startsWith(`${active[0].props.href}/`));
    assert.ok(links.every(link => link.props.prefetch === false));
  }
});

test("shell provides semantic navigation, keyboard skip link, and always-visible responsive links", () => {
  const html = renderToStaticMarkup(render(app.AdminShell, { children: "Authorized content" }));
  for (const name of ["Dashboard", "Orders", "Products", "Inventory"]) assert.match(html, new RegExp(name));
  assert.match(html, /aria-label="Admin navigation"/);
  assert.match(html, /href="#admin-content"/);
  assert.match(html, /id="admin-content" tabindex="-1"/);
  assert.match(html, /grid-cols-2.*sm:grid-cols-4.*lg:grid-cols-1/);
  assert.match(html, /focus-visible:outline/);
});

test("loading and error UI are generic, accessible, and error reset is wired", () => {
  let resets = 0;
  assert.match(renderToStaticMarkup(app.AdminLoading()), /role="status"/);
  const tree = app.AdminError({ error: new Error("secret database credentials"), reset: () => { resets++; } });
  button(tree).props.onClick();
  assert.equal(resets, 1);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /secret|credentials/);
});
