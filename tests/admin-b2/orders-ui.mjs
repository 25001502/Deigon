import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { bundle } from "../admin-a/support/bundle.mjs";

const app = await bundle(`
  export * from './components/admin/orders/order-ui';
  export * from './components/admin/orders/order-api';
  export { AdminOrdersResults } from './components/admin/orders/admin-orders-list';
  export { AdminOrderDetailContent } from './components/admin/orders/admin-order-detail';
`, {
  "next/link": `export default function Link({ children, prefetch: _prefetch, ...props }) { return <a {...props}>{children}</a>; }`,
});

function detail(overrides = {}) {
  const order = {
    id: "order_admin_b2",
    orderNumber: "DGN-B2-1001",
    customerName: "Lerato Ndlovu",
    customerEmail: "lerato@example.invalid",
    customerPhone: "+27 71 000 0000",
    createdAt: "2026-09-23T12:00:00.000Z",
    total: "650.00",
    subtotal: "600.00",
    shippingFee: "50.00",
    paymentStatus: "PAID",
    fulfilmentType: "DELIVERY",
    status: "CONFIRMED",
    confirmedAt: "2026-09-23T12:05:00.000Z",
    processingAt: null,
    shippedAt: null,
    readyForPickupAt: null,
    deliveredAt: null,
    estimatedDeliveryDate: "2026-09-30",
    cancelledAt: null,
    cancelReason: null,
    shippingAddressLine1: "10 Main Road",
    shippingAddressLine2: null,
    shippingCity: "Thohoyandou",
    shippingProvince: "Limpopo",
    shippingPostalCode: "0950",
    shippingCountry: "South Africa",
    pickupLocation: null,
    items: [{
      title: "Foxygeon Hoodie",
      sku: "FOX-BLK-M",
      size: "M",
      color: "Black",
      imageUrl: "https://www.deigon.co.za/cdn/shop/files/hoodie.jpg",
      quantity: 2,
      unitPrice: "300.00",
      lineTotal: "600.00",
    }],
    payment: { provider: "yoco", amount: "650.00", status: "PAID" },
  };
  return { ...order, ...overrides };
}

function renderDetail(order) {
  return renderToStaticMarkup(app.AdminOrderDetailContent({
    order,
    pendingAction: null,
    notice: null,
    error: null,
    onTransition() {},
    onEstimate() {},
  }));
}

function response(status, payload = { ok: false, message: "private detail" }) {
  return Promise.resolve(new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

test("order list renders snapshots, statuses, totals and detail links", () => {
  const html = renderToStaticMarkup(app.AdminOrdersResults({ orders: [detail()] }));
  for (const text of ["DGN-B2-1001", "Lerato Ndlovu", "lerato@example.invalid", "Delivery", "Paid", "Confirmed", "View order"]) {
    assert.match(html, new RegExp(text, "i"));
  }
  assert.match(html, /href="\/admin\/orders\/order_admin_b2"/);
  assert.match(html, /R(?:&nbsp;|\s)*650[,.]00/);
  assert.match(html, /<table/);
});

test("empty order list has a useful empty state", () => {
  const html = renderToStaticMarkup(app.AdminOrdersResults({ orders: [] }));
  assert.match(html, /No orders found/);
  assert.match(html, /changing the submitted search or filters/);
});

test("search and filters build the exact B1 query and trim submitted search", () => {
  const query = new URLSearchParams(app.buildOrderListQuery({
    search: "  lerato@example.invalid  ",
    status: "PROCESSING",
    paymentStatus: "PAID",
    fulfilmentType: "DELIVERY",
  }, null));
  assert.deepEqual(Object.fromEntries(query), {
    search: "lerato@example.invalid",
    status: "PROCESSING",
    paymentStatus: "PAID",
    fulfilmentType: "DELIVERY",
    limit: "25",
  });
});

test("pagination sends the backend cursor and a fresh query can omit it", () => {
  const filters = { search: "DGN", status: "", paymentStatus: "", fulfilmentType: "" };
  assert.equal(new URLSearchParams(app.buildOrderListQuery(filters, "next_cursor")).get("cursor"), "next_cursor");
  assert.equal(new URLSearchParams(app.buildOrderListQuery(filters, null)).has("cursor"), false);
});

test("list client uses GET and the B1 pagination endpoint without local filtering", async () => {
  const calls = [];
  const result = await app.fetchAdminOrders(
    { search: "DGN", status: "CONFIRMED", paymentStatus: "PAID", fulfilmentType: "PICKUP" },
    "cursor_value",
    async (url, init) => {
      calls.push([url, init]);
      return response(200, { ok: true, data: { orders: [], nextCursor: null } });
    },
  );
  assert.equal(result.kind, "ok");
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /^\/api\/admin\/orders\?/);
  assert.equal(new URLSearchParams(calls[0][0].split("?")[1]).get("cursor"), "cursor_value");
  assert.equal(calls[0][1].method, "GET");
});

for (const [status, targetStatus, label] of [
  ["CONFIRMED", "PROCESSING", "Start processing"],
  ["PROCESSING", "SHIPPED", "Mark shipped"],
  ["SHIPPED", "DELIVERED", "Mark delivered"],
]) {
  test(`delivery ${status} offers only ${targetStatus}`, () => {
    const order = detail({ status });
    assert.deepEqual(app.nextFulfilmentAction(order), { targetStatus, label });
    const html = renderDetail(order);
    assert.match(html, new RegExp(`>${label}<`));
    for (const illegal of ["Ready for collection", "Mark collected"]) assert.doesNotMatch(html, new RegExp(`>${illegal}<`));
  });
}

for (const [status, targetStatus, label] of [
  ["CONFIRMED", "PROCESSING", "Start processing"],
  ["PROCESSING", "READY_FOR_PICKUP", "Ready for collection"],
  ["READY_FOR_PICKUP", "DELIVERED", "Mark collected"],
]) {
  test(`pickup ${status} offers only ${targetStatus}`, () => {
    const order = detail({ fulfilmentType: "PICKUP", status, pickupLocation: "Univen main gate", estimatedDeliveryDate: null });
    assert.deepEqual(app.nextFulfilmentAction(order), { targetStatus, label });
    const html = renderDetail(order);
    assert.match(html, new RegExp(`>${label}<`));
    assert.doesNotMatch(html, /Estimated delivery date|Mark shipped|Mark delivered/);
  });
}

for (const status of ["DELIVERED", "CANCELLED"]) {
  test(`${status} is terminal and renders no mutation action`, () => {
    const order = detail({ status, deliveredAt: status === "DELIVERED" ? "2026-09-25T10:00:00.000Z" : null, cancelledAt: status === "CANCELLED" ? "2026-09-24T10:00:00.000Z" : null });
    assert.equal(app.nextFulfilmentAction(order), null);
    const html = renderDetail(order);
    assert.match(html, /terminal state/);
    assert.doesNotMatch(html, />Start processing<|>Mark shipped<|>Mark delivered<|>Ready for collection<|>Mark collected</);
  });
}

test("pending or unpaid orders render no fulfilment action", () => {
  for (const order of [
    detail({ status: "PENDING", paymentStatus: "PENDING", confirmedAt: null, payment: { provider: "yoco", amount: "650.00", status: "PENDING" } }),
    detail({ paymentStatus: "FAILED", payment: { provider: "yoco", amount: "650.00", status: "FAILED" } }),
    detail({ payment: null }),
  ]) {
    assert.equal(app.nextFulfilmentAction(order), null);
    assert.match(renderDetail(order), /until payment is authoritatively confirmed/);
  }
});

test("delivery ETA control is limited to paid confirmed, processing and shipped orders", () => {
  for (const status of ["CONFIRMED", "PROCESSING", "SHIPPED"]) {
    const order = detail({ status });
    assert.equal(app.canEditEstimatedDelivery(order), true);
    assert.match(renderDetail(order), /type="date"/);
  }
  for (const order of [
    detail({ status: "DELIVERED" }),
    detail({ status: "PENDING", paymentStatus: "PENDING", confirmedAt: null }),
    detail({ fulfilmentType: "PICKUP", estimatedDeliveryDate: null, pickupLocation: "Main gate" }),
  ]) assert.equal(app.canEditEstimatedDelivery(order), false);
  assert.doesNotMatch(renderDetail(detail({ fulfilmentType: "PICKUP", estimatedDeliveryDate: null })), /Estimated delivery/);
});

test("ETA PATCH contains only optimistic concurrency fields and supports set or clear", async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push([url, init]);
    return response(200, { ok: true, data: detail({ estimatedDeliveryDate: null }) });
  };
  await app.updateAdminOrderEstimate(detail(), "2026-10-02", fetcher);
  await app.updateAdminOrderEstimate(detail(), null, fetcher);
  assert.equal(calls[0][0], "/api/admin/orders/order_admin_b2/estimated-delivery");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    expectedStatus: "CONFIRMED",
    expectedEstimatedDeliveryDate: "2026-09-30",
    estimatedDeliveryDate: "2026-10-02",
  });
  assert.equal(JSON.parse(calls[1][1].body).estimatedDeliveryDate, null);
  assert.deepEqual(Object.keys(JSON.parse(calls[0][1].body)).sort(), ["estimatedDeliveryDate", "expectedEstimatedDeliveryDate", "expectedStatus"].sort());
});

test("fulfilment PATCH sends expected and next status only", async () => {
  const calls = [];
  await app.transitionAdminOrder("order/id", "PROCESSING", "SHIPPED", async (url, init) => {
    calls.push([url, init]);
    return response(200, { ok: true, data: detail({ status: "SHIPPED" }) });
  });
  assert.equal(calls[0][0], "/api/admin/orders/order%2Fid/fulfilment");
  assert.deepEqual(JSON.parse(calls[0][1].body), { expectedStatus: "PROCESSING", targetStatus: "SHIPPED" });
  assert.equal(calls[0][1].method, "PATCH");
});

test("409 refreshes latest order exactly once and never retries the mutation", async () => {
  let mutations = 0;
  let refreshes = 0;
  const latest = detail({ status: "PROCESSING", processingAt: "2026-09-24T10:00:00.000Z" });
  const result = await app.performOrderMutation(
    async () => { mutations++; return { kind: "conflict" }; },
    async () => { refreshes++; return { kind: "ok", data: latest }; },
  );
  assert.equal(mutations, 1);
  assert.equal(refreshes, 1);
  assert.deepEqual(result, { kind: "conflict", latest: { kind: "ok", data: latest } });
});

test("successful mutation refreshes authoritative detail", async () => {
  const mutation = detail({ status: "PROCESSING" });
  const latest = detail({ status: "SHIPPED" });
  assert.deepEqual(await app.performOrderMutation(async () => ({ kind: "ok", data: mutation }), async () => ({ kind: "ok", data: latest })), {
    kind: "updated", data: latest, refreshFailed: false,
  });
});

for (const kind of ["unauthenticated", "forbidden"]) {
  test(`successful mutation propagates post-success refresh ${kind} without retry`, async () => {
    let mutations = 0;
    let refreshes = 0;
    const result = await app.performOrderMutation(
      async () => { mutations++; return { kind: "ok", data: detail({ status: "PROCESSING" }) }; },
      async () => { refreshes++; return { kind }; },
    );
    assert.equal(mutations, 1);
    assert.equal(refreshes, 1);
    assert.deepEqual(result, { kind: "failed", result: { kind } });
  });
}

test("successful mutation retains its response when refresh fails generically", async () => {
  let mutations = 0;
  let refreshes = 0;
  const mutation = detail({ status: "PROCESSING" });
  const result = await app.performOrderMutation(
    async () => { mutations++; return { kind: "ok", data: mutation }; },
    async () => { refreshes++; return { kind: "error" }; },
  );
  assert.equal(mutations, 1);
  assert.equal(refreshes, 1);
  assert.deepEqual(result, {
    kind: "updated", data: mutation, refreshFailed: true,
  });
});

test("401 and 403 are handled as explicit access states without exposing response messages", async () => {
  for (const [status, kind] of [[401, "unauthenticated"], [403, "forbidden"]]) {
    const result = await app.fetchAdminOrder("order_admin_b2", () => response(status));
    assert.deepEqual(result, { kind });
    assert.doesNotMatch(JSON.stringify(result), /private detail/);
  }
});

test("network and malformed success responses fail generically", async () => {
  assert.deepEqual(await app.fetchAdminOrder("order_admin_b2", async () => { throw new Error("secret endpoint"); }), { kind: "error" });
  assert.deepEqual(await app.fetchAdminOrder("order_admin_b2", () => response(200, { ok: false, message: "secret" })), { kind: "error" });
});

test("detail UI exposes read-only payment facts and no payment mutation", () => {
  const html = renderDetail(detail());
  assert.match(html, /Payment status is read-only/);
  assert.match(html, /Provider payment/);
  assert.doesNotMatch(html, /mark paid|set payment|refund payment|providerCheckoutId|transactionId|idempotencyKey/i);
  assert.doesNotMatch(html, /\/payment(?:s)?(?:"|\/)/i);
});

test("invalid snapshot image protocols are not rendered", () => {
  assert.equal(app.safeImageSource("javascript:alert(1)"), null);
  assert.equal(app.safeImageSource("//evil.example/image.jpg"), null);
  assert.equal(app.safeImageSource("/products/image.jpg"), "/products/image.jpg");
});

test("Johannesburg minimum date rolls over at 22:00 UTC", () => {
  assert.equal(app.johannesburgToday(new Date("2026-09-23T21:59:59.000Z")), "2026-09-23");
  assert.equal(app.johannesburgToday(new Date("2026-09-23T22:00:00.000Z")), "2026-09-24");
});

test("both order pages independently invoke the server-side admin page guard", async () => {
  let checks = 0;
  globalThis.__adminB2Guard = () => { checks++; };
  const pages = await bundle(`
    export { default as listPage } from './app/admin/(protected)/orders/page';
    export { default as detailPage } from './app/admin/(protected)/orders/[orderId]/page';
  `, {
    "@/lib/auth/require-admin-page": `export async function requireAdminPage() { globalThis.__adminB2Guard(); }`,
    "@/components/admin/orders/admin-orders-list": `export function AdminOrdersList() { return <div>orders</div>; }`,
    "@/components/admin/orders/admin-order-detail": `export function AdminOrderDetailView({ orderId }) { return <div>{orderId}</div>; }`,
  });
  await pages.listPage();
  await pages.detailPage({ params: Promise.resolve({ orderId: "order_admin_b2" }) });
  assert.equal(checks, 2);
  delete globalThis.__adminB2Guard;
});
