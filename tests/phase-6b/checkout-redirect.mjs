// Run: node --test tests/phase-6b/checkout-redirect.mjs
// Execute the actual component handler with isolated React hooks, cart and browser boundaries.
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, mock, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const keyName = "deigon_checkout_idempotency_key";
const redirectUrl = "https://c.yoco.com/test_checkout";
const success = { ok: true, order: { id: "order_test" }, payment: { provider: "YOCO", redirectUrl } };
const originals = { window: globalThis.window, FormData: globalThis.FormData };
let view;

const bundle = await build({
  stdin: {
    contents: `export { CheckoutPreview } from './components/checkout/checkout-preview';
      export { default as Success } from './app/checkout/payment/success/page';
      export { default as Cancel } from './app/checkout/payment/cancel/page';
      export { default as Failure } from './app/checkout/payment/failure/page';`,
    resolveDir: root, sourcefile: "phase6b-frontend.tsx", loader: "tsx",
  },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
  plugins: [{ name: "frontend-boundaries", setup(builder) {
    builder.onResolve({ filter: /^(react|next\/link|@\/components\/cart\/cart-provider)$/ }, ({ path }) => ({ path, namespace: "test-ui" }));
    builder.onLoad({ filter: /.*/, namespace: "test-ui" }, ({ path }) => ({ contents:
      path === "react" ? `export const useMemo = fn => fn();
        export const useState = initial => globalThis.__checkoutView.useState(initial);
        export const useSyncExternalStore = (_subscribe, snapshot) => snapshot();`
        : path === "next/link" ? "export default function Link() { return null; }"
          : "export const useCart = () => globalThis.__checkoutView.cart;",
    }));
  } }],
});
const loaded = new Module(path.join(root, "phase6b-frontend.cjs"));
loaded.filename = path.join(root, "phase6b-frontend.cjs");
loaded.paths = Module._nodeModulePaths(root);
loaded._compile(bundle.outputFiles[0].text, loaded.filename);
const { CheckoutPreview, Success, Cancel, Failure } = loaded.exports;

beforeEach(() => {
  const values = [], storage = new Map(), events = [];
  view = {
    cursor: 0, storage, events,
    useState(initial) {
      const i = this.cursor++;
      if (!(i in values)) values[i] = initial;
      return [values[i], (value) => { values[i] = typeof value === "function" ? value(values[i]) : value; }];
    },
    cart: {
      items: [{ variantId: "variant_test", title: "Test", price: 400, quantity: 1 }], subtotal: 400,
      async waitForPendingMutations() { events.push("wait"); },
      clearCartLocally() { events.push("clear-local"); view.cart.items = []; },
    },
  };
  globalThis.__checkoutView = view;
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); },
      removeItem: (key) => { events.push("remove-key"); storage.delete(key); },
    },
    location: { assign: (url) => { events.push(["assign", url]); } },
  };
  globalThis.FormData = class {
    get(name) {
      return { firstName: "Test", lastName: "Customer", email: "test@example.invalid", address: "TEST address", city: "TEST city", province: "Limpopo", postalCode: "0000" }[name];
    }
  };
  mock.method(globalThis, "fetch", async (_url, options) => {
    events.push(["fetch", JSON.parse(options.body)]);
    return Response.json(success, { status: 201 });
  });
});

afterEach(() => {
  mock.restoreAll();
  if (originals.window === undefined) delete globalThis.window;
  else globalThis.window = originals.window;
  globalThis.FormData = originals.FormData;
  delete globalThis.__checkoutView;
});

function render() { view.cursor = 0; return CheckoutPreview(); }
function find(node, matches) {
  if (!node || typeof node !== "object") return undefined;
  if (matches(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, matches);
    if (result) return result;
  }
}
async function submit() {
  const form = find(render(), (node) => node.type === "form");
  assert.ok(form);
  await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
}

test("waits for cart synchronization, then clears locally, removes the key and assigns the validated URL", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  view.cart.waitForPendingMutations = async () => { view.events.push("wait"); await gate; };
  const pending = submit();
  assert.equal(globalThis.fetch.mock.callCount(), 0);
  release();
  await pending;
  assert.equal(view.events[0], "wait");
  assert.equal(view.events[1][0], "fetch");
  assert.deepEqual(view.events.slice(2), ["clear-local", "remove-key", ["assign", redirectUrl]]);
  assert.ok(view.events[1][1].idempotencyKey);
  assert.equal(view.storage.has(keyName), false);
  const sent = view.events[1][1];
  for (const key of ["total", "amount", "price", "subtotal", "shippingFee", "status", "paymentStatus", "userId"]) assert.ok(!(key in sent));
  assert.equal(find(render(), (node) => node.type === "h1").props.children, "Opening secure payment...");
});

test("provider failure preserves the key, cart and form; retry uses the same application key", async () => {
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ ok: false, message: "Payment session unavailable" }, { status: 503 }));
  await submit();
  const key = view.storage.get(keyName);
  assert.ok(key);
  assert.equal(view.cart.items.length, 1);
  assert.equal(find(render(), (node) => node.props?.role === "alert").props.children, "Payment session unavailable");
  globalThis.fetch.mock.mockImplementation(async (_url, options) => {
    assert.equal(JSON.parse(options.body).idempotencyKey, key);
    return Response.json(success, { status: 201 });
  });
  await submit();
  assert.equal(view.storage.has(keyName), false);
  assert.deepEqual(view.events.at(-1), ["assign", redirectUrl]);
});

test("network failure retains the key and does not clear or redirect", async () => {
  globalThis.fetch.mock.mockImplementation(async () => { throw new Error("Connection unavailable"); });
  await submit();
  assert.ok(view.storage.get(keyName));
  assert.deepEqual(view.events, ["wait"]);
  assert.ok(find(render(), (node) => node.props?.role === "alert"));
});

test("missing, malformed or unsafe redirects never clear the cart or discard the key", async () => {
  for (const payment of [undefined, { provider: "OTHER", redirectUrl }, ...["", "/relative", "javascript:alert(1)", "http://c.yoco.com/test", "https://user:pass@c.yoco.com/test"].map((url) => ({ provider: "YOCO", redirectUrl: url }))]) {
    globalThis.fetch.mock.mockImplementation(async () => Response.json({ ok: true, order: success.order, payment }));
    await submit();
    assert.ok(view.storage.get(keyName));
    assert.equal(view.cart.items.length, 1);
    assert.ok(find(render(), (node) => node.type === "form"));
  }
  assert.ok(view.events.every((event) => event === "wait"));
});

test("refresh with an empty server cart can resume a stored checkout attempt", async () => {
  view.cart.items = [];
  view.storage.set(keyName, "existing-attempt");
  assert.equal(find(render(), (node) => node.type === "button" && node.props.type === "submit").props.disabled, false);
  await submit();
  assert.equal(view.events[1][1].idempotencyKey, "existing-attempt");
  assert.deepEqual(view.events.at(-1), ["assign", redirectUrl]);
});

test("an empty cart with no saved attempt cannot submit", async () => {
  view.cart.items = [];
  assert.equal(find(render(), (node) => node.type === "button" && node.props.type === "submit").props.disabled, true);
  await submit();
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("a browser navigation error restores the key and allows retry even after local clearing", async () => {
  window.location.assign = () => { throw new Error("Navigation unavailable"); };
  await submit();
  assert.ok(view.storage.get(keyName));
  assert.equal(view.cart.items.length, 0);
  assert.ok(find(render(), (node) => node.props?.role === "alert"));
  assert.equal(find(render(), (node) => node.type === "button" && node.props.type === "submit").props.disabled, false);
});

test("return pages render cautious wording without claiming paid or confirmed status", () => {
  for (const Page of [Success, Cancel, Failure]) {
    const html = renderToStaticMarkup(createElement(Page));
    assert.doesNotMatch(html, /Payment successful|Order paid|Payment confirmed/i);
    assert.match(html, /not yet been confirmed|does not confirm|not confirmed/);
  }
});
