import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { bundle } from "../admin-a/support/bundle.mjs";

let state;
const orderId = "order_customer_c_123";
const otherOrderId = "order_customer_c_456";

const money = (value) => ({ toFixed: () => value });

function record(overrides = {}) {
  return {
    orderNumber: "DGN-C-1001",
    status: "PROCESSING",
    paymentStatus: "PAID",
    fulfilmentType: "DELIVERY",
    subtotal: money("600.00"),
    shippingFee: money("50.00"),
    total: money("650.00"),
    customerName: "Historical Customer",
    customerEmail: "snapshot@example.invalid",
    customerPhone: "0710000000",
    shippingAddressLine1: "12 Snapshot Street",
    shippingAddressLine2: null,
    shippingCity: "Thohoyandou",
    shippingProvince: "Limpopo",
    shippingPostalCode: "0950",
    shippingCountry: "South Africa",
    pickupLocation: null,
    createdAt: new Date("2026-09-20T08:00:00.000Z"),
    confirmedAt: new Date("2026-09-20T08:05:00.000Z"),
    processingAt: new Date("2026-09-21T09:00:00.000Z"),
    shippedAt: null,
    readyForPickupAt: null,
    deliveredAt: null,
    estimatedDeliveryDate: new Date("2026-09-27T00:00:00.000Z"),
    cancelledAt: null,
    cancelReason: "internal-admin-note-secret",
    items: [{
      title: "Historical Jacket",
      sku: "SNAPSHOT-SKU",
      size: "M",
      color: "Black",
      imageUrl: "https://example.invalid/jacket.jpg",
      quantity: 2,
      unitPrice: money("300.00"),
      lineTotal: money("600.00"),
      productId: "product-secret",
      variantId: "variant-secret",
    }],
    userId: "owner-secret",
    addressId: "address-secret",
    idempotencyKey: "idempotency-secret",
    payment: {
      provider: "YOCO",
      providerCheckoutId: "checkout-secret",
      transactionId: "transaction-secret",
    },
    ...overrides,
  };
}

function detail(overrides = {}) {
  const source = record(overrides);
  return {
    orderNumber: source.orderNumber,
    status: source.status,
    paymentStatus: source.paymentStatus,
    fulfilmentType: source.fulfilmentType,
    subtotal: source.subtotal.toFixed(2),
    shippingFee: source.shippingFee.toFixed(2),
    total: source.total.toFixed(2),
    customerName: source.customerName,
    customerEmail: source.customerEmail,
    customerPhone: source.customerPhone,
    shippingAddressLine1: source.shippingAddressLine1,
    shippingAddressLine2: source.shippingAddressLine2,
    shippingCity: source.shippingCity,
    shippingProvince: source.shippingProvince,
    shippingPostalCode: source.shippingPostalCode,
    shippingCountry: source.shippingCountry,
    pickupLocation: source.pickupLocation,
    createdAt: source.createdAt.toISOString(),
    confirmedAt: source.confirmedAt?.toISOString() ?? null,
    processingAt: source.processingAt?.toISOString() ?? null,
    shippedAt: source.shippedAt?.toISOString() ?? null,
    readyForPickupAt: source.readyForPickupAt?.toISOString() ?? null,
    deliveredAt: source.deliveredAt?.toISOString() ?? null,
    estimatedDeliveryDate: source.estimatedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    cancelledAt: source.cancelledAt?.toISOString() ?? null,
    items: source.items.map((item) => ({
      title: item.title,
      sku: item.sku,
      size: item.size,
      color: item.color,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
    })),
  };
}

const app = await bundle(`
  export { GET } from './app/api/account/orders/[orderId]/route';
  export { getCustomerOrderForCurrentUser } from './lib/account/orders/query';
  export * from './components/account/orders/order-ui';
  export * from './components/account/orders/order-api';
  export { CustomerOrderDetailContent, CustomerOrderDetailView } from './components/account/orders/customer-order-detail';
  export { default as CustomerOrderPage } from './app/account/orders/[orderId]/page';
  export { default as CustomerOrderLoading } from './app/account/orders/[orderId]/loading';
  export { AccountDashboard } from './components/account/account-dashboard';
`, {
  "server-only": "",
  "@/lib/prisma": `export const prisma = { order: { findFirst: args => globalThis.__customerC.findFirst(args) } };`,
  "@/lib/supabase/server": `export const createClient = async () => ({ auth: { getUser: () => globalThis.__customerC.getUser() } });`,
  "@/lib/supabase/client": `export const createClient = () => ({ auth: {} });`,
  "next/navigation": `export function redirect(url) { const error = new Error('NEXT_REDIRECT'); error.location = url; throw error; }`,
  "next/link": `export default function Link({ children, ...props }) { return <a {...props}>{children}</a>; }`,
  "@/components/auth/logout-button": `export function LogoutButton() { return <button>Sign out</button>; }`,
});

beforeEach(() => {
  state = {
    user: { id: "owner-user", email: "owner@example.invalid" },
    authError: null,
    row: record(),
    queries: [],
    databaseError: null,
    async getUser() {
      return { data: { user: this.user }, error: this.authError };
    },
    async findFirst(args) {
      this.queries.push(args);
      if (this.databaseError) throw this.databaseError;
      return args.where.id === orderId && args.where.userId === "owner-user" ? this.row : null;
    },
  };
  globalThis.__customerC = state;
});

function response(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function read(id = orderId, suffix = "") {
  const result = await app.GET(new Request(`https://shop.example/api/account/orders/${id}${suffix}`), {
    params: Promise.resolve({ orderId: id }),
  });
  return { response: result, body: await result.json() };
}

test("authenticated owner lookup is constrained by both order id and verified user id", async () => {
  const result = await read();
  assert.equal(result.response.status, 200);
  assert.deepEqual(state.queries[0].where, { id: orderId, userId: "owner-user" });
  assert.equal(state.queries.length, 1);
  assert.equal(result.body.data.orderNumber, "DGN-C-1001");
});

test("unauthenticated requests return 401 before any order lookup", async () => {
  state.user = null;
  const result = await read();
  assert.deepEqual({ status: result.response.status, body: result.body }, {
    status: 401,
    body: { ok: false, message: "Authentication required" },
  });
  assert.equal(state.queries.length, 0);
});

test("another customer's, unknown and malformed order ids share one safe 404", async () => {
  const foreign = await read(otherOrderId);
  const unknown = await read("order_unknown_123");
  const malformed = await read("bad<script>");
  for (const result of [foreign, unknown, malformed]) {
    assert.equal(result.response.status, 404);
    assert.deepEqual(result.body, { ok: false, message: "Order not found" });
    assert.doesNotMatch(JSON.stringify(result.body), /DGN-C-1001|snapshot@example|owner-user/);
  }
});

test("query parameters and headers cannot override the verified owner", async () => {
  const result = await app.GET(new Request(`https://shop.example/api/account/orders/${orderId}?userId=other-user`, {
    headers: { "x-user-id": "other-user", "x-role": "ADMIN" },
  }), { params: Promise.resolve({ orderId }) });
  assert.equal(result.status, 200);
  assert.deepEqual(state.queries[0].where, { id: orderId, userId: "owner-user" });
});

test("customer response is an explicit allowlist without internal or provider identifiers", async () => {
  const { body } = await read();
  assert.deepEqual(Object.keys(body.data).sort(), [
    "cancelledAt", "confirmedAt", "createdAt", "customerEmail", "customerName", "customerPhone",
    "deliveredAt", "estimatedDeliveryDate", "fulfilmentType", "items", "orderNumber", "paymentStatus", "pickupLocation",
    "processingAt", "readyForPickupAt", "shippedAt", "shippingAddressLine1", "shippingAddressLine2", "shippingCity",
    "shippingCountry", "shippingFee", "shippingPostalCode", "shippingProvince", "status", "subtotal", "total",
  ].sort());
  assert.deepEqual(Object.keys(body.data.items[0]).sort(), [
    "color", "imageUrl", "lineTotal", "quantity", "size", "sku", "title", "unitPrice",
  ].sort());
  assert.doesNotMatch(JSON.stringify(body), /owner-secret|address-secret|product-secret|variant-secret|idempotency-secret|checkout-secret|transaction-secret|internal-admin-note-secret|YOCO/);
});

test("success and failure responses are private and not cacheable", async () => {
  assert.equal((await read()).response.headers.get("cache-control"), "private, no-store, max-age=0");
  state.user = null;
  assert.equal((await read()).response.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("unexpected database errors are masked", async () => {
  mock.method(console, "error", () => {});
  state.databaseError = new Error("postgres://private-secret");
  const result = await read();
  assert.equal(result.response.status, 500);
  assert.deepEqual(result.body, { ok: false, message: "Internal server error" });
  assert.doesNotMatch(JSON.stringify(result.body), /private-secret/);
  mock.restoreAll();
});

test("client detail request uses one credentialed no-store GET with an encoded id", async () => {
  const calls = [];
  const result = await app.fetchCustomerOrder("order/id", async (url, init) => {
    calls.push([url, init]);
    return response(200, { ok: true, data: detail() });
  });
  assert.equal(result.kind, "ok");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/account/orders/order%2Fid");
  assert.deepEqual({ method: calls[0][1].method, credentials: calls[0][1].credentials, cache: calls[0][1].cache }, {
    method: "GET", credentials: "same-origin", cache: "no-store",
  });
});

test("client maps expired access and not found without exposing server messages", async () => {
  for (const [status, kind] of [[401, "unauthenticated"], [403, "unauthenticated"], [404, "not-found"]]) {
    const result = await app.fetchCustomerOrder(orderId, () => response(status, { message: "private server detail" }));
    assert.deepEqual(result, { kind });
    assert.doesNotMatch(JSON.stringify(result), /private server detail/);
  }
});

test("network, server and malformed success responses fail generically", async () => {
  assert.deepEqual(await app.fetchCustomerOrder(orderId, async () => { throw new Error("network secret"); }), { kind: "error" });
  assert.deepEqual(await app.fetchCustomerOrder(orderId, () => response(500, { message: "server secret" })), { kind: "error" });
  assert.deepEqual(await app.fetchCustomerOrder(orderId, () => response(200, { ok: true, data: { orderNumber: "partial" } })), { kind: "error" });
  assert.deepEqual(await app.fetchCustomerOrder(orderId, () => new Response("not json", { status: 200 })), { kind: "error" });
});

test("delivery detail renders snapshots, totals, address, status and estimate", () => {
  const html = renderToStaticMarkup(app.CustomerOrderDetailContent({ order: detail() }));
  for (const expected of [
    "DGN-C-1001", "Processing", "Historical Customer", "snapshot@example.invalid", "12 Snapshot Street",
    "Historical Jacket", "SNAPSHOT-SKU", "R 650,00", "Estimated delivery", "27 September 2026",
  ]) assert.match(html, new RegExp(expected));
});

test("delivery without an ETA gives a neutral unavailable message", () => {
  const html = renderToStaticMarkup(app.CustomerOrderDetailContent({ order: detail({ estimatedDeliveryDate: null }) }));
  assert.match(html, /Not available yet/);
  assert.match(html, /when one is available/);
});

test("pickup detail uses collection wording and never renders delivery address or ETA", () => {
  const pickup = detail({
    fulfilmentType: "PICKUP",
    status: "READY_FOR_PICKUP",
    pickupLocation: "DEIGON Thohoyandou collection point",
    shippingAddressLine1: null,
    shippingCity: null,
    shippingProvince: null,
    shippingPostalCode: null,
    shippingCountry: null,
    estimatedDeliveryDate: null,
    readyForPickupAt: new Date("2026-09-22T10:00:00.000Z"),
  });
  const html = renderToStaticMarkup(app.CustomerOrderDetailContent({ order: pickup }));
  assert.match(html, /Ready for collection/);
  assert.match(html, /Collection details/);
  assert.match(html, /DEIGON Thohoyandou collection point/);
  assert.match(html, /Collected/);
  assert.doesNotMatch(html, /Estimated delivery|12 Snapshot Street|Out for delivery/);
});

test("pickup completion is labelled Collected while delivery completion is Delivered", () => {
  assert.equal(app.orderStatusLabel("PICKUP", "DELIVERED"), "Collected");
  assert.equal(app.orderStatusLabel("DELIVERY", "DELIVERED"), "Delivered");
  assert.equal(app.orderStatusLabel("DELIVERY", "SHIPPED"), "Out for delivery");

  const deliveredAt = new Date("2026-09-23T12:00:00.000Z");
  const deliveryHtml = renderToStaticMarkup(app.CustomerOrderDetailContent({ order: detail({ status: "DELIVERED", shippedAt: deliveredAt, deliveredAt }) }));
  const pickupHtml = renderToStaticMarkup(app.CustomerOrderDetailContent({ order: detail({
    fulfilmentType: "PICKUP", status: "DELIVERED", pickupLocation: "Main gate", estimatedDeliveryDate: null,
    readyForPickupAt: deliveredAt, deliveredAt,
  }) }));
  assert.match(deliveryHtml, />Delivered</);
  assert.match(pickupHtml, />Collected</);
});

test("timeline never presents stages beyond the authoritative status as reached", () => {
  const pending = detail({
    status: "PENDING",
    paymentStatus: "PENDING",
    confirmedAt: null,
    processingAt: new Date("2026-09-21T09:00:00.000Z"),
  });
  const timeline = app.customerTimeline(pending);
  assert.deepEqual(timeline.map((entry) => entry.state), ["current", "future", "future", "future", "future"]);
  assert.ok(timeline.slice(1).every((entry) => entry.value === "Not reached"));
});

test("reached legacy stages with missing timestamps remain explicitly unknown", () => {
  const timeline = app.customerTimeline(detail({ status: "SHIPPED", processingAt: null, shippedAt: null }));
  assert.equal(timeline.find((entry) => entry.label === "Processing").value, "Timestamp unavailable");
  assert.equal(timeline.find((entry) => entry.label === "Out for delivery").state, "current");
  assert.equal(timeline.find((entry) => entry.label === "Delivered").value, "Not reached");
});

test("cancelled orders are unmistakable and show only recorded history", () => {
  const cancelled = detail({
    status: "CANCELLED",
    cancelledAt: new Date("2026-09-22T11:00:00.000Z"),
    shippedAt: null,
  });
  const html = renderToStaticMarkup(app.CustomerOrderDetailContent({ order: cancelled }));
  assert.match(html, /This order was cancelled/);
  assert.equal(app.customerTimeline(cancelled).at(-1).state, "current");
});

test("customer UI contains no admin, payment, fulfilment or ETA mutation controls", () => {
  const html = renderToStaticMarkup(app.CustomerOrderDetailContent({ order: detail() }));
  assert.doesNotMatch(html, /mark paid|start processing|mark shipped|mark delivered|ready for collection<\/button|mark collected|save date|clear date/i);
  assert.doesNotMatch(html, /providerCheckoutId|transactionId|idempotencyKey|userId|addressId|productId|variantId|YOCO/);
  assert.doesNotMatch(html, /<form|<input|method="post"|method="patch"/i);
});

test("invalid image schemes are not rendered", () => {
  assert.equal(app.safeImageSource("javascript:alert(1)"), null);
  assert.equal(app.safeImageSource("//evil.example/image.jpg"), null);
  assert.equal(app.safeImageSource("/products/image.jpg"), "/products/image.jpg");
});

test("detail page independently checks the server session and redirects to normal login", async () => {
  state.user = null;
  await assert.rejects(
    app.CustomerOrderPage({ params: Promise.resolve({ orderId }) }),
    (error) => error.location === "/login",
  );
  state.user = { id: "owner-user", email: "owner@example.invalid" };
  assert.ok(await app.CustomerOrderPage({ params: Promise.resolve({ orderId }) }));
});

test("route loading and client loading states are accessible", () => {
  assert.match(renderToStaticMarkup(app.CustomerOrderLoading()), /role="status"/);
  assert.match(renderToStaticMarkup(createElement(app.CustomerOrderDetailView, { orderId })), /role="status"/);
});

test("account order history exposes customer detail links and fulfilment-aware labels", () => {
  const html = renderToStaticMarkup(createElement(app.AccountDashboard, {
    profile: { name: "Customer", email: "customer@example.invalid", phone: null, role: "CUSTOMER", createdAt: new Date("2026-01-01") },
    addresses: [],
    orders: [{ id: orderId, orderNumber: "DGN-C-1001", status: "DELIVERED", fulfilmentType: "PICKUP", total: "650.00", createdAt: new Date("2026-09-20") }],
  }));
  assert.match(html, new RegExp(`/account/orders/${orderId}`));
  assert.match(html, /View details/);
  assert.match(html, /Collected/);
});
