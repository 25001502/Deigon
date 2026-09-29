import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import { bundle, root } from "../admin-a/support/bundle.mjs";
import { database } from "../admin-b1/support/database.mjs";

const context = new AsyncLocalStorage();
const source = (file) => readFileSync(`${root}/${file}`, "utf8");
const fixedAt = new Date("2026-10-02T12:00:00.000Z");
let handle, db, app;

function checkoutInput(idempotencyKey = randomUUID(), overrides = {}) {
  return {
    idempotencyKey,
    fulfilmentType: "PICKUP",
    customerName: "F6 Customer",
    customerEmail: "f6@example.invalid",
    pickupLocation: "F6 pickup",
    ...overrides,
  };
}

async function fixture(lines) {
  const suffix = randomUUID();
  const category = await db.category.create({ data: { name: `F6 ${suffix}`, slug: `f6-${suffix}` } });
  const user = await db.user.create({ data: { id: randomUUID(), email: `f6-${suffix}@example.invalid` } });
  const cart = await db.cart.create({ data: { userId: user.id } });
  const variants = [];

  for (const [index, line] of lines.entries()) {
    const product = await db.product.create({
      data: { name: `F6 product ${index}`, slug: `f6-product-${suffix}-${index}`, categoryId: category.id },
    });
    const variant = await db.productVariant.create({
      data: {
        sku: `F6-${suffix}-${index}`,
        price: line.price,
        salePrice: line.salePrice ?? null,
        saleStartsAt: line.saleStartsAt ?? null,
        saleEndsAt: line.saleEndsAt ?? null,
        productId: product.id,
        inventory: { create: { quantity: line.stock ?? 10 } },
      },
      include: { inventory: true },
    });
    await db.cartItem.create({
      data: { cartId: cart.id, productId: product.id, variantId: variant.id, quantity: line.quantity ?? 1 },
    });
    variants.push({ product, variant });
  }

  return { user, cart, variants };
}

async function storedOrder(idempotencyKey) {
  return db.order.findUniqueOrThrow({
    where: { idempotencyKey },
    include: { items: { orderBy: { variantId: "asc" } }, payment: true },
  });
}

before(async () => {
  handle = await database();
  db = handle.db;
  globalThis.__adminF6 = { db, context };
  app = await bundle(`
    export { getCart, serializeCart } from './lib/cart/service';
    export { GET as cartGET } from './app/api/cart/route';
    export { createOrder } from './lib/checkout/service';
    export { reconcileGuestCartLines } from './components/cart/cart-provider';
    export {
      calculateDisplayLineTotal,
      calculateDisplaySubtotal,
      calculateDisplayThresholdCharge,
    } from './components/cart/cart-money';
  `, {
    "server-only": "",
    "@/lib/prisma": "export const prisma = globalThis.__adminF6.db;",
    "@/lib/auth/require-user": `export class AuthError extends Error {
      constructor(message, status) { super(message); this.status = status; }
    }
    export async function requireUser() {
      const user = globalThis.__adminF6.context.getStore()?.user;
      if (!user) throw new AuthError('Authentication required', 401);
      return user;
    }`,
    "@/components/auth/auth-provider": "export function useAuth() { return { user: null, loading: false }; }",
  });
});

after(async () => {
  delete globalThis.__adminF6;
  await handle?.close();
});

test("authenticated cart resolves NONE, SCHEDULED, ACTIVE and exact-end pricing privately", async () => {
  const { user, variants } = await fixture([
    { price: "100.00" },
    { price: "200.00", salePrice: "150.00", saleStartsAt: new Date("2026-10-03T00:00:00.000Z") },
    { price: "300.00", salePrice: "250.00", saleStartsAt: new Date("2026-10-01T00:00:00.000Z"), saleEndsAt: new Date("2026-10-03T00:00:00.000Z") },
    { price: "400.00", salePrice: "350.00", saleEndsAt: fixedAt },
  ]);
  const serialized = app.serializeCart(await app.getCart(user.id), fixedAt);
  const byId = new Map(serialized.items.map((item) => [item.variantId, item.variant]));
  assert.deepEqual(byId.get(variants[0].variant.id), { id: variants[0].variant.id, size: null, color: null, price: 100, normalPrice: 100, isOnSale: false, inventory: { quantity: 10, inStock: true } });
  assert.equal(byId.get(variants[1].variant.id).price, 200);
  assert.equal(byId.get(variants[1].variant.id).isOnSale, false);
  assert.deepEqual(
    (({ price, normalPrice, isOnSale }) => ({ price, normalPrice, isOnSale }))(byId.get(variants[2].variant.id)),
    { price: 250, normalPrice: 300, isOnSale: true },
  );
  assert.equal(byId.get(variants[3].variant.id).price, 400);
  assert.equal(byId.get(variants[3].variant.id).isOnSale, false);
  assert.doesNotMatch(JSON.stringify(serialized), /salePrice|saleStartsAt|saleEndsAt|SCHEDULED|EXPIRED/);
});

test("cart line totals and subtotal use Decimal effective prices before number serialization", async () => {
  const { user } = await fixture([
    { price: "1499.99", salePrice: "1199.95", quantity: 2 },
    { price: "10.10", quantity: 3 },
  ]);
  const cart = app.serializeCart(await app.getCart(user.id), fixedAt);
  assert.deepEqual(cart.items.map((item) => item.lineTotal).sort((a, b) => a - b), [30.3, 2399.9]);
  assert.equal(cart.subtotal, 2430.2);
});

test("authenticated cart GET is private no-store and exposes only resolved pricing", async () => {
  const { user } = await fixture([{ price: "1499.99", salePrice: "1199.95" }]);
  const response = await context.run({ user }, () => app.cartGET());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  const body = await response.json();
  assert.equal(body.cart.items[0].variant.price, 1199.95);
  assert.equal(body.cart.items[0].variant.normalPrice, 1499.99);
  assert.equal(body.cart.items[0].variant.isOnSale, true);
  assert.doesNotMatch(JSON.stringify(body), /salePrice|saleStartsAt|saleEndsAt|ACTIVE|SCHEDULED|EXPIRED/);
});

function storedGuest(overrides = {}) {
  return {
    handle: "shared-product",
    variantId: "variant-a",
    title: "Stored title",
    vendor: "Stored vendor",
    badge: "",
    image: undefined,
    themeClass: "theme-collection-foxygeon",
    price: 999,
    normalPrice: 999,
    isOnSale: false,
    quantity: 2,
    ...overrides,
  };
}

function publicResponse() {
  return {
    ok: true,
    product: {
      id: "product-a",
      slug: "shared-product",
      name: "Current title",
      description: null,
      badge: "Current badge",
      details: [],
      featured: false,
      isActive: true,
      category: { id: "category-a", name: "Current vendor", slug: "foxygeon-collections" },
      images: [{ id: "image-a", url: "/current.jpg", alt: null, position: 0 }],
      variants: [
        { id: "variant-a", sku: "A", size: "M", color: "Black", price: 750, normalPrice: 1000, isOnSale: true, inventory: { quantity: 5, inStock: true } },
        { id: "variant-b", sku: "B", size: "L", color: "Black", price: 1100, normalPrice: 1100, isOnSale: false, inventory: { quantity: 5, inStock: true } },
      ],
    },
  };
}

test("guest reconciliation deduplicates handles, refreshes exact variants and restores normal pricing after sale expiry", async () => {
  const calls = [];
  const stored = [
    storedGuest(),
    storedGuest({ variantId: "variant-b", price: 700, normalPrice: 1100, isOnSale: true, quantity: 4 }),
  ];
  const refreshed = await app.reconcileGuestCartLines(stored, async (url, init) => {
    calls.push([url, init]);
    return new Response(JSON.stringify(publicResponse()), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/products/shared-product");
  assert.equal(calls[0][1].cache, "no-store");
  assert.deepEqual(
    refreshed.map(({ price, normalPrice, isOnSale, quantity }) => ({ price, normalPrice, isOnSale, quantity })),
    [
      { price: 750, normalPrice: 1000, isOnSale: true, quantity: 2 },
      { price: 1100, normalPrice: 1100, isOnSale: false, quantity: 4 },
    ],
  );
  assert.doesNotMatch(JSON.stringify(refreshed), /salePrice|saleStartsAt|saleEndsAt|SCHEDULED|EXPIRED/);
});

test("guest reconciliation keeps stored estimates on network, API, product or variant failure", async () => {
  const stored = [storedGuest()];
  for (const fetchImpl of [
    async () => { throw new Error("offline"); },
    async () => new Response("{}", { status: 503 }),
    async () => new Response(JSON.stringify({ ok: true, product: { ...publicResponse().product, variants: [] } }), { status: 200 }),
  ]) {
    assert.deepEqual(await app.reconcileGuestCartLines(stored, fetchImpl), stored);
  }
});

test("selected variant metadata is explicit and merge input remains identity plus quantity only", () => {
  const panel = source("components/storefront/product-purchase-panel.tsx");
  assert.match(panel, /price: displayPricing\.price/);
  assert.match(panel, /normalPrice: displayPricing\.normalPrice/);
  assert.match(panel, /isOnSale: displayPricing\.isOnSale/);
  const provider = source("components/cart/cart-provider.tsx");
  const mergeBody = provider.match(/items:\s*guestItems\.map\([\s\S]*?\),\s*\}\),/s)?.[0] ?? "";
  assert.match(mergeBody, /variantId/);
  assert.match(mergeBody, /slug/);
  assert.match(mergeBody, /quantity/);
  assert.doesNotMatch(mergeBody, /price|normalPrice|isOnSale|discount/);
});

test("guest hydration reconciles once per auth load and never uses a client clock", () => {
  const provider = source("components/cart/cart-provider.tsx");
  assert.equal((provider.match(/await reconcileGuestCartLines\(guestItems\)/g) ?? []).length, 1);
  assert.doesNotMatch(provider, /Date\.now|saleStartsAt|saleEndsAt|setInterval/);
  assert.match(provider, /\}, \[authLoading, user\?\.id\]\)/);
});

test("client cents arithmetic reaches the exact R600 delivery threshold", () => {
  const floatingPointSubtotal = 0.01 * 3 + 85.71 * 7;
  const subtotal = app.calculateDisplaySubtotal([
    { price: 0.01, quantity: 3 },
    { price: 85.71, quantity: 7 },
  ]);

  assert.equal(floatingPointSubtotal, 599.9999999999999);
  assert.equal(subtotal, 600);
  assert.equal(app.calculateDisplayThresholdCharge(subtotal, 600, 80), 0);
});

test("client cents arithmetic keeps an exact R599.99 below the delivery threshold", () => {
  const subtotal = app.calculateDisplaySubtotal([{ price: 599.99, quantity: 1 }]);
  assert.equal(subtotal, 599.99);
  assert.equal(app.calculateDisplayThresholdCharge(subtotal, 600, 80), 80);
});

test("client cents arithmetic keeps an exact R600.01 above the delivery threshold", () => {
  const subtotal = app.calculateDisplaySubtotal([{ price: 600.01, quantity: 1 }]);
  assert.equal(subtotal, 600.01);
  assert.equal(app.calculateDisplayThresholdCharge(subtotal, 600, 80), 0);
});

test("client cents arithmetic produces an exact display line total for R1199.95 times two", () => {
  assert.equal(app.calculateDisplayLineTotal(1199.95, 2), 2399.9);
});

test("client cents arithmetic uses resolved effective sale price instead of normalPrice", () => {
  const saleLine = { price: 85.71, normalPrice: 100, isOnSale: true, quantity: 7 };
  assert.equal(app.calculateDisplaySubtotal([saleLine]), 599.97);
  const provider = source("components/cart/cart-provider.tsx");
  const preview = source("components/checkout/checkout-preview.tsx");
  assert.match(provider, /calculateDisplaySubtotal\(items\)/);
  assert.match(preview, /calculateDisplayLineTotal\(\s*item\.price,\s*item\.quantity/);
  assert.match(preview, /calculateDisplayThresholdCharge\(\s*subtotal,\s*FREE_DELIVERY_THRESHOLD,\s*FLAT_DELIVERY_FEE/);
  assert.doesNotMatch(
    preview.match(/const requestBody = \{[\s\S]*?\n      \};/)?.[0] ?? "",
    /(?:^|\s)(?:price|subtotal|shipping|total|salePrice)\s*:/m,
  );
});

test("active sale checkout snapshots one Decimal price through Order, OrderItem and Payment", async () => {
  const key = randomUUID();
  const { user } = await fixture([{ price: "1499.99", salePrice: "1199.95", quantity: 2 }]);
  let clockCalls = 0;
  await app.createOrder(user.id, checkoutInput(key), () => { clockCalls += 1; return fixedAt; });
  const order = await storedOrder(key);
  assert.equal(clockCalls, 1);
  assert.equal(order.items[0].unitPrice.toFixed(2), "1199.95");
  assert.equal(order.items[0].lineTotal.toFixed(2), "2399.90");
  assert.equal(order.subtotal.toFixed(2), "2399.90");
  assert.equal(order.shippingFee.toFixed(2), "0.00");
  assert.equal(order.total.toFixed(2), "2399.90");
  assert.equal(order.payment.amount.toFixed(2), order.total.toFixed(2));
});

test("no-sale pickup checkout keeps normal pricing and zero shipping", async () => {
  const key = randomUUID();
  const { user } = await fixture([{ price: "615.25", quantity: 2 }]);
  await app.createOrder(user.id, checkoutInput(key), () => fixedAt);
  const order = await storedOrder(key);
  assert.equal(order.items[0].unitPrice.toFixed(2), "615.25");
  assert.equal(order.items[0].lineTotal.toFixed(2), "1230.50");
  assert.equal(order.subtotal.toFixed(2), "1230.50");
  assert.equal(order.shippingFee.toFixed(2), "0.00");
  assert.equal(order.total.toFixed(2), "1230.50");
  assert.equal(order.payment.amount.toFixed(2), "1230.50");
});

for (const [name, schedule, expected] of [
  ["scheduled", { saleStartsAt: new Date("2026-10-03T00:00:00.000Z") }, "1500.00"],
  ["active interval", { saleStartsAt: new Date("2026-10-01T00:00:00.000Z"), saleEndsAt: new Date("2026-10-03T00:00:00.000Z") }, "1200.00"],
  ["exact end", { saleEndsAt: fixedAt }, "1500.00"],
  ["expired", { saleEndsAt: new Date("2026-10-01T00:00:00.000Z") }, "1500.00"],
]) test(`checkout uses ${name} boundary semantics`, async () => {
  const key = randomUUID();
  const { user } = await fixture([{ price: "1500.00", salePrice: "1200.00", ...schedule }]);
  await app.createOrder(user.id, checkoutInput(key), () => fixedAt);
  assert.equal((await storedOrder(key)).items[0].unitPrice.toFixed(2), expected);
});

for (const [name, price, salePrice, expectedShipping] of [
  ["effective 599.99", "700.00", "599.99", "80.00"],
  ["effective 600.00", "700.00", "600.00", "0.00"],
  ["sale drops normal 650 below threshold", "650.00", "550.00", "80.00"],
]) test(`delivery shipping threshold uses ${name}`, async () => {
  const key = randomUUID();
  const { user } = await fixture([{ price, salePrice }]);
  await app.createOrder(user.id, checkoutInput(key, {
    fulfilmentType: "DELIVERY",
    pickupLocation: undefined,
    shippingAddressLine1: "1 F6 Street",
    shippingCity: "Thohoyandou",
    shippingProvince: "Limpopo",
    shippingPostalCode: "0950",
  }), () => fixedAt);
  assert.equal((await storedOrder(key)).shippingFee.toFixed(2), expectedShipping);
});

test("multiple checkout variants share one pricing clock and keep their own resolved prices", async () => {
  const key = randomUUID();
  const { user } = await fixture([
    { price: "100.00", salePrice: "80.00", quantity: 2 },
    { price: "50.00", salePrice: "40.00", quantity: 3 },
  ]);
  let clockCalls = 0;
  await app.createOrder(user.id, checkoutInput(key), () => { clockCalls += 1; return fixedAt; });
  const order = await storedOrder(key);
  assert.equal(clockCalls, 1);
  assert.deepEqual(order.items.map((item) => item.unitPrice.toFixed(2)).sort(), ["40.00", "80.00"]);
  assert.equal(order.subtotal.toFixed(2), "280.00");
});

test("idempotent retry returns stored sale totals without calling the pricing clock again", async () => {
  const key = randomUUID();
  const { user, variants } = await fixture([{ price: "1500.00", salePrice: "1200.00" }]);
  let clockCalls = 0;
  const pricingNow = () => { clockCalls += 1; return fixedAt; };
  const first = await app.createOrder(user.id, checkoutInput(key), pricingNow);
  await db.productVariant.update({ where: { id: variants[0].variant.id }, data: { salePrice: null, saleStartsAt: null, saleEndsAt: null, price: "1700.00" } });
  const replay = await app.createOrder(user.id, checkoutInput(key), pricingNow);
  assert.deepEqual(replay, first);
  assert.equal(clockCalls, 1);
  assert.equal((await storedOrder(key)).items[0].unitPrice.toFixed(2), "1200.00");
});

test("client pricing fields never override authoritative checkout pricing", async () => {
  const key = randomUUID();
  const { user } = await fixture([{ price: "1500.00", salePrice: "1200.00" }]);
  await app.createOrder(user.id, checkoutInput(key, {
    price: "0.01",
    subtotal: "0.01",
    total: "0.01",
    salePrice: "0.01",
    isOnSale: false,
  }), () => fixedAt);
  const order = await storedOrder(key);
  assert.equal(order.subtotal.toFixed(2), "1200.00");
  assert.equal(order.payment.amount.toFixed(2), order.total.toFixed(2));
  assert.doesNotMatch(source("components/checkout/checkout-preview.tsx").match(/const requestBody = \{[\s\S]*?\n      \};/)?.[0] ?? "", /price|subtotal|total|sale/);
});

test("inventory failure after sale resolution rolls back stock, cart, order and payment", async () => {
  const key = randomUUID();
  const { user, variants } = await fixture([
    { price: "100.00", salePrice: "80.00", stock: 2 },
    { price: "100.00", salePrice: "70.00", stock: 0 },
  ]);
  await assert.rejects(
    () => app.createOrder(user.id, checkoutInput(key), () => fixedAt),
    (error) => error?.status === 409,
  );
  const quantities = (
    await db.inventory.findMany({
      where: { variantId: { in: variants.map(({ variant }) => variant.id) } },
      select: { quantity: true },
    })
  ).map(({ quantity }) => quantity).sort((left, right) => left - right);
  assert.deepEqual(quantities, [0, 2]);
  assert.equal(await db.cartItem.count({ where: { cart: { userId: user.id } } }), 2);
  assert.equal(await db.order.count({ where: { idempotencyKey: key } }), 0);
  assert.equal(await db.payment.count({ where: { order: { idempotencyKey: key } } }), 0);
});

test("cart UI reuses resolved sale presentation and payment/Yoco code remains unchanged", () => {
  assert.match(source("components/cart/cart-page.tsx"), /<ProductPrice pricing=\{item\}/);
  assert.match(source("components/checkout/checkout-preview.tsx"), /<ProductPrice pricing=\{item\}/);
  const checkout = source("lib/checkout/service.ts");
  assert.match(checkout, /const pricingAt = pricingNow\(\)/);
  assert.match(checkout, /const pricedLines = cart\.items\.map/);
  assert.match(checkout, /unitPrice,\s*lineTotal,/);
  for (const file of ["lib/payments/yoco.ts", "lib/payments/prepare-order-payment.ts", "lib/payments/process-yoco-webhook.ts"]) {
    assert.doesNotMatch(source(file), /resolveVariantPrice|salePrice|saleStartsAt|saleEndsAt/, file);
  }
});

test("every cart response captures one timestamp and is private no-store", () => {
  for (const file of [
    "app/api/cart/route.ts",
    "app/api/cart/items/route.ts",
    "app/api/cart/items/[variantId]/route.ts",
    "app/api/cart/merge/route.ts",
  ]) {
    const route = source(file);
    const handlerCount = (route.match(/export async function (?:GET|POST|PATCH|DELETE)/g) ?? []).length;
    assert.equal((route.match(/const pricingAt = new Date\(\)/g) ?? []).length, handlerCount, file);
    assert.equal((route.match(/private, no-store, max-age=0/g) ?? []).length, handlerCount, file);
  }
});
