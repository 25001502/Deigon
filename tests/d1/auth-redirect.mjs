import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { bundle, find } from "../admin-a/support/bundle.mjs";

const app = await bundle(`
  export { default as checkoutPage } from './app/checkout/page';
  export { default as loginPage } from './app/login/page';
  export { default as signupPage } from './app/signup/page';
  export { AuthForm } from './components/auth/auth-form';
  export { authPathFor, safeCallbackPath } from './lib/auth/safe-callback-path';
`, {
  "next/navigation": `
    export function redirect(path) { const error = new Error('redirect'); error.location = path; throw error; }
    export function useRouter() { return { refresh: () => globalThis.__d1.events.push('refresh'), push: path => globalThis.__d1.events.push(['push', path]) }; }
  `,
  "@/lib/auth/require-user": `
    export class AuthError extends Error { constructor(message, status) { super(message); this.status = status; } }
    export async function requireUser() {
      if (globalThis.__d1.access === 'guest') throw new AuthError('Authentication needed', 401);
      if (globalThis.__d1.access === 'denied') throw new AuthError('Forbidden', 403);
      return { id: 'customer-id' };
    }
  `,
  "@/components/checkout/checkout-preview": "export function CheckoutPreview() { return null; }",
  "@/lib/supabase/client": `
    export function createClient() { return { auth: {
      signInWithPassword: async input => { globalThis.__d1.authInput = input; return globalThis.__d1.authResult; },
      signUp: async input => { globalThis.__d1.authInput = input; return globalThis.__d1.authResult; },
    } }; }
  `,
  "react": "export const useState = initial => [initial, () => {}];",
  "next/link": "export default function Link() { return null; }",
});

beforeEach(() => {
  globalThis.__d1 = {
    access: "guest", events: [], authInput: null,
    authResult: { error: null, data: { session: { user: { id: "customer-id" } } } },
  };
  globalThis.window = { location: {
    origin: "https://www.deigon.co.za",
    assign: path => globalThis.__d1.events.push(["assign", path]),
  } };
});
afterEach(() => {
  delete globalThis.__d1;
  delete globalThis.window;
});

function formAction(mode, next) {
  const form = find(app.AuthForm({ mode, next }), node => node.type === "form");
  assert.ok(form);
  return form.props.action;
}

function credentials() {
  const data = new FormData();
  data.set("email", "customer@example.invalid");
  data.set("password", "password123");
  return data;
}

test("direct guest checkout enters signup with the checkout destination", async () => {
  await assert.rejects(app.checkoutPage(), error => error.location === "/signup?next=%2Fcheckout");
});

test("authenticated checkout renders directly; non-401 access failures are not login redirects", async () => {
  globalThis.__d1.access = "customer";
  assert.ok(await app.checkoutPage());
  globalThis.__d1.access = "denied";
  await assert.rejects(app.checkoutPage(), error => error.status === 403 && !error.location);
});

test("login and signup pages pass only safe return destinations to the form", async () => {
  for (const page of [app.loginPage, app.signupPage]) {
    const safe = await page({ searchParams: Promise.resolve({ next: "/checkout" }) });
    assert.equal(find(safe, node => node.type === app.AuthForm).props.next, "/checkout");
    const unsafe = await page({ searchParams: Promise.resolve({ next: "https://evil.example" }) });
    assert.equal(find(unsafe, node => node.type === app.AuthForm).props.next, "/account");
  }
});

test("successful login returns to checkout", async () => {
  await formAction("login", "/checkout")(credentials());
  assert.deepEqual(globalThis.__d1.events, [["assign", "/checkout"]]);
});

test("registration with an immediate session returns to checkout", async () => {
  await formAction("signup", "/checkout")(credentials());
  assert.deepEqual(globalThis.__d1.events, [["assign", "/checkout"]]);
  assert.equal(new URL(globalThis.__d1.authInput.options.emailRedirectTo).searchParams.get("next"), "/checkout");
});

test("registration requiring email confirmation retains checkout in the callback", async () => {
  globalThis.__d1.authResult = { error: null, data: { session: null } };
  await formAction("signup", "/checkout")(credentials());
  assert.equal(new URL(globalThis.__d1.authInput.options.emailRedirectTo).searchParams.get("next"), "/checkout");
  assert.equal(globalThis.__d1.events.some(event => Array.isArray(event) && event[0] === "push"), false);
});

test("ordinary login still uses the established account navigation", async () => {
  await formAction("login", undefined)(credentials());
  assert.deepEqual(globalThis.__d1.events, ["refresh", ["push", "/account"]]);
});

test("switching between login and signup preserves checkout", () => {
  for (const [mode, target] of [["login", "/signup?next=%2Fcheckout"], ["signup", "/login?next=%2Fcheckout"]]) {
    const link = find(app.AuthForm({ mode, next: "/checkout" }), node => node.type?.name === "Link");
    assert.equal(link.props.href, target);
  }
});

test("external, protocol-relative and malformed return paths are rejected centrally", () => {
  for (const next of ["https://evil.example", "//evil.example", "/%2fevil.example", "/\\evil.example", "javascript:alert(1)"]) {
    assert.equal(app.safeCallbackPath(next), "/account");
    assert.equal(app.authPathFor("login", next), "/login");
  }
  assert.equal(app.safeCallbackPath(["/checkout", "//evil.example"]), "/account");
  assert.equal(app.authPathFor("login", "/checkout"), "/login?next=%2Fcheckout");
});

async function createCartHarness() {
  const storage = new Map();
  const storageWrites = [];
  const hooks = {
    cursor: 0, slots: [], effects: [],
    auth: { user: null, loading: false },
  };
  globalThis.__d1Cart = hooks;
  globalThis.window.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storageWrites.push([key, value]); storage.set(key, value); },
    removeItem: key => storage.delete(key),
  };
  const cartModule = await bundle("export { CartProvider } from './components/cart/cart-provider';", {
    "@/components/auth/auth-provider": "export const useAuth = () => globalThis.__d1Cart.auth;",
    "react": `
      export const createContext = () => ({ Provider: function Provider() {} });
      export const useContext = context => context.value;
      export function useState(initial) {
        const h = globalThis.__d1Cart, index = h.cursor++;
        if (!h.slots[index]) h.slots[index] = { value: initial };
        return [h.slots[index].value, value => {
          const current = h.slots[index].value;
          h.slots[index].value = typeof value === 'function' ? value(current) : value;
        }];
      }
      export function useRef(initial) {
        const h = globalThis.__d1Cart, index = h.cursor++;
        if (!h.slots[index]) h.slots[index] = { current: initial };
        return h.slots[index];
      }
      export function useEffect(effect, deps) {
        const h = globalThis.__d1Cart, index = h.cursor++;
        const previous = h.slots[index]?.deps;
        if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
          h.slots[index] = { deps };
          h.effects.push(effect);
        }
      }
      export function useMemo(factory) { globalThis.__d1Cart.cursor++; return factory(); }
    `,
  });
  const renderCart = () => {
    hooks.cursor = 0;
    hooks.effects = [];
    const view = cartModule.CartProvider({ children: null });
    const value = view.props.value;
    for (const effect of hooks.effects) effect();
    return value;
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  const product = {
    handle: "test-product", variantId: "variant-1", title: "Test product",
    vendor: "Test", badge: "", image: undefined, price: 100,
    normalPrice: 100, isOnSale: false, themeClass: "test",
  };
  return { storage, storageWrites, hooks, renderCart, settle, product };
}

test("guest cart is saved before navigation and merged before checkout becomes ready", async () => {
  const { storage, storageWrites, hooks, renderCart, settle, product } = await createCartHarness();
  renderCart();
  await settle();
  const guestCart = renderCart();
  await guestCart.addItem(product, 2, { waitForServer: true });
  assert.equal(JSON.parse(storage.get("deigon-cart"))[0].quantity, 2);

  let completeMerge;
  const mergeGate = new Promise(resolve => { completeMerge = resolve; });
  const mergeRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url !== "/api/cart/merge") throw new Error(`Unexpected cart request: ${url}`);
    mergeRequests.push(JSON.parse(options.body));
    await mergeGate;
    return Response.json({ ok: true, cart: {
      items: [{ variantId: "variant-1", quantity: 2,
        product: { slug: "test-product", name: "Test product", vendor: "Test", collectionHandle: "test", badge: null, images: [] },
        variant: { id: "variant-1", sku: "TEST", size: null, color: null, price: 100, normalPrice: 100, isOnSale: false } }],
      itemCount: 2, subtotal: 200,
    } });
  };
  try {
    hooks.auth = { user: { id: "customer-1" }, loading: false };
    assert.equal(renderCart().readyForCheckout, false);
    assert.equal(storage.has("deigon-cart"), true);
    assert.deepEqual(mergeRequests, [{ items: [{ variantId: "variant-1", slug: "test-product", quantity: 2 }] }]);
    completeMerge();
    await settle();
    const authenticatedCart = renderCart();
    assert.equal(authenticatedCart.readyForCheckout, true);
    assert.equal(authenticatedCart.items[0].quantity, 2);
    assert.equal(storage.has("deigon-cart"), false);

    const pendingProduct = { ...product, handle: "another-product", variantId: "variant-2" };
    const writesBefore401 = storageWrites.length;
    let mutationRequests = 0;
    globalThis.fetch = async url => {
      if (url === "/api/cart/items" || url === "/api/cart") {
        if (url === "/api/cart/items") mutationRequests++;
        return Response.json({ ok: false, message: "Authentication required" }, { status: 401 });
      }
      throw new Error(`Unexpected cart request: ${url}`);
    };
    await assert.rejects(
      authenticatedCart.addItem(pendingProduct, 1, { waitForServer: true }),
      error => error.name === "CartAuthenticationError",
    );
    const pendingLines = JSON.parse(storage.get("deigon-cart"));
    assert.deepEqual(pendingLines.map(line => [line.variantId, line.quantity]), [["variant-2", 1]]);
    assert.equal(mutationRequests, 1);
    assert.equal(storageWrites.length, writesBefore401 + 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__d1Cart;
  }
});

test("an in-flight User A cart addition cannot become User B guest storage or a merge", async () => {
  const { storage, hooks, renderCart, settle, product } = await createCartHarness();
  const originalFetch = globalThis.fetch;
  let releaseMutation;
  let mutationStarted;
  const started = new Promise(resolve => { mutationStarted = resolve; });
  const mutationGate = new Promise(resolve => { releaseMutation = resolve; });
  const requests = [];
  const emptyCart = { items: [], itemCount: 0, subtotal: 0 };
  globalThis.fetch = async (url) => {
    requests.push(url);
    if (url === "/api/cart") return Response.json({ ok: true, cart: emptyCart });
    if (url === "/api/cart/items") {
      mutationStarted();
      await mutationGate;
      return Response.json({ ok: true });
    }
    throw new Error(`Unexpected cart request: ${url}`);
  };
  try {
    renderCart();
    await settle();
    hooks.auth = { user: { id: "user-a" }, loading: false };
    renderCart();
    await settle();
    const userACart = renderCart();
    assert.equal(userACart.readyForCheckout, true);

    const pending = userACart.addItem(product, 1, { waitForServer: true });
    await started;
    hooks.auth = { user: { id: "user-b" }, loading: false };
    renderCart();
    await settle();
    releaseMutation();
    await assert.rejects(pending, error => error.message === "Cart session changed. Please try again." && error.name !== "CartAuthenticationError");

    assert.equal(storage.has("deigon-cart"), false);
    assert.equal(requests.filter(url => url === "/api/cart/merge").length, 0);
    assert.deepEqual(renderCart().items, []);
    assert.equal(renderCart().readyForCheckout, true);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__d1Cart;
  }
});

test("a queued User A addition invalidated before its request does not persist for User B", async () => {
  const { storage, hooks, renderCart, settle, product } = await createCartHarness();
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    if (url === "/api/cart") return Response.json({ ok: true, cart: { items: [], itemCount: 0, subtotal: 0 } });
    throw new Error(`Unexpected cart request: ${url}`);
  };
  try {
    renderCart();
    await settle();
    hooks.auth = { user: { id: "user-a" }, loading: false };
    renderCart();
    await settle();
    const pending = renderCart().addItem(product, 1, { waitForServer: true });
    hooks.auth = { user: { id: "user-b" }, loading: false };
    renderCart();
    await assert.rejects(pending, error => error.message === "Cart session changed. Please try again.");
    await settle();
    assert.equal(storage.has("deigon-cart"), false);
    assert.equal(requests.includes("/api/cart/items"), false);
    assert.equal(requests.includes("/api/cart/merge"), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__d1Cart;
  }
});

test("guest Buy Now enters signup after checkout with the destination retained", async () => {
  globalThis.window.setTimeout = () => 1;
  const purchase = await bundle("export { ProductPurchasePanel } from './components/storefront/product-purchase-panel';", {
    "react": `
      export const useMemo = factory => factory();
      export const useEffect = () => {};
      export const useState = initial => [initial, () => {}];
    `,
    "next/navigation": "export const useRouter = () => ({ push: path => globalThis.__d1.events.push(['push', path]) });",
    "next/link": "export default function Link() { return null; }",
    "@/components/cart/cart-provider": "export const useCart = () => ({ addItem: async () => {} }); export class CartAuthenticationError extends Error {}",
    "./product-price": `
      export const currentPriceFor = () => ({ price: 100, normalPrice: 100, isOnSale: false });
      export const ProductPrice = () => null;
    `,
  });
  const product = {
    handle: "test-product", title: "Test product", variants: [{
      variantId: "variant-1", sku: "TEST", size: null, color: null,
      inventory: { inStock: true, quantity: 2 },
    }],
  };
  const panel = purchase.ProductPurchasePanel({ product });
  const buyNow = find(panel, node => node.type === "button" && node.props.children === "Buy it now");
  assert.ok(buyNow);
  buyNow.props.onClick();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(globalThis.__d1.events, [["push", "/checkout"]]);
  await assert.rejects(app.checkoutPage(), error => error.location === "/signup?next=%2Fcheckout");
});

test("guest cart checkout reaches signup with the checkout destination", async () => {
  const cart = await bundle("export { CartPage } from './components/cart/cart-page';", {
    "react": "export const useState = initial => [initial, () => {}];",
    "next/navigation": "export const useRouter = () => ({ push: path => globalThis.__d1.events.push(['push', path]) });",
    "next/link": "export default function Link() { return null; }",
    "next/image": "export default function Image() { return null; }",
    "@/components/cart/cart-provider": `
      export const useCart = () => ({
        items: [{ handle: 'test-product', variantId: 'variant-1', title: 'Test', quantity: 1, price: 100 }],
        itemCount: 1, subtotal: 100, waitForPendingMutations: async () => {},
      });
    `,
    "@/components/storefront/mock-product-media": "export function MockProductMedia() { return null; }",
    "@/components/storefront/product-price": "export function ProductPrice() { return null; }",
  });
  const checkout = find(cart.CartPage(), node => node.type === "button" && node.props.children === "Checkout");
  assert.ok(checkout);
  checkout.props.onClick();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(globalThis.__d1.events, [["push", "/checkout"]]);
  await assert.rejects(app.checkoutPage(), error => error.location === "/signup?next=%2Fcheckout");
});

test("Buy Now routes an expired cart session through login and back to checkout", async () => {
  const purchase = await bundle("export { ProductPurchasePanel } from './components/storefront/product-purchase-panel';", {
    "react": `
      export const useMemo = factory => factory();
      export const useEffect = () => {};
      export const useState = initial => [initial, () => {}];
    `,
    "next/navigation": "export const useRouter = () => ({ push: path => globalThis.__d1.events.push(['push', path]) });",
    "next/link": "export default function Link() { return null; }",
    "@/components/cart/cart-provider": `
      export class CartAuthenticationError extends Error {}
      export const useCart = () => ({ addItem: async () => { throw new CartAuthenticationError(); } });
    `,
    "./product-price": `
      export const currentPriceFor = () => ({ price: 100, normalPrice: 100, isOnSale: false });
      export const ProductPrice = () => null;
    `,
  });
  const product = {
    handle: "test-product", title: "Test product", variants: [{
      variantId: "variant-1", sku: "TEST", size: null, color: null,
      inventory: { inStock: true, quantity: 2 },
    }],
  };
  const panel = purchase.ProductPurchasePanel({ product });
  const buyNow = find(panel, node => node.type === "button" && node.props.children === "Buy it now");
  assert.ok(buyNow);
  buyNow.props.onClick();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(globalThis.__d1.events, [["push", "/login?next=%2Fcheckout"]]);
});
