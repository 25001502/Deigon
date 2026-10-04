import assert from "node:assert/strict";
import { test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";

const app = await bundle(`
  export * from './lib/email/render-order-email';
  export * from './lib/email/templates/order-email-v1';
`, { "server-only": "" });

const appOrigin = "https://www.deigon.co.za";

const delivery = () => ({
  version: 1,
  orderId: "order-email-1",
  orderNumber: "DGN-EMAIL-1",
  customer: { name: "Customer One", email: "customer@example.invalid" },
  fulfilmentType: "DELIVERY",
  items: [{
    title: "Snapshot product",
    sku: "SNAPSHOT-SKU",
    size: "M",
    color: "Black",
    imageUrl: "/products/snapshot.jpg",
    quantity: 2,
    unitPrice: "125.00",
    lineTotal: "250.00",
  }],
  subtotal: "250.00",
  shippingFee: "80.00",
  total: "330.00",
  destination: {
    type: "DELIVERY",
    addressLine1: "1 Snapshot Street",
    addressLine2: null,
    city: "Johannesburg",
    province: "Gauteng",
    postalCode: "2000",
    country: "South Africa",
  },
  createdAt: "2026-10-02T08:00:00.000Z",
  confirmedAt: "2026-10-02T08:01:00.000Z",
  processingAt: null,
  shippedAt: null,
  readyForPickupAt: null,
  deliveredAt: null,
  estimatedDeliveryDate: "2026-10-09",
});

const pickup = () => ({
  ...delivery(),
  orderId: "order-email-2",
  orderNumber: "DGN-EMAIL-2",
  fulfilmentType: "PICKUP",
  items: [{
    title: "Pickup product",
    sku: "PICKUP-SKU",
    size: null,
    color: null,
    imageUrl: null,
    quantity: 1,
    unitPrice: "250.00",
    lineTotal: "250.00",
  }],
  shippingFee: "0.00",
  total: "250.00",
  destination: { type: "PICKUP", pickupLocation: "DEIGON collection point" },
  estimatedDeliveryDate: null,
});

const render = (eventType, payload, overrides = {}) => app.renderOrderEmail({
  eventType,
  templateVersion: 1,
  payload,
  appOrigin,
  ...overrides,
});

test("delivery confirmation renders the itemised receipt, exact totals, destination and CTA", () => {
  const result = render("ORDER_CONFIRMED", delivery());
  assert.equal(result.subject, "Order DGN-EMAIL-1 confirmed — DEIGON");
  for (const value of [
    "Your DEIGON order has been confirmed", "Customer One", "Snapshot product", "Quantity: 2",
    "Size: M", "Colour: Black", "R 250.00", "R 80.00", "R 330.00", "1 Snapshot Street",
    "https://www.deigon.co.za/account/orders/order-email-1", "View your order",
  ]) assert.match(`${result.html}\n${result.text}`, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(result.html, /src="https:\/\/www\.deigon\.co\.za\/products\/snapshot\.jpg"/);
  assert.doesNotMatch(`${result.html}\n${result.text}`, /customer@example\.invalid|SNAPSHOT-SKU/);
});

test("pickup confirmation uses collection wording, zero shipping and optional item fields", () => {
  const result = render("ORDER_CONFIRMED", pickup());
  assert.match(result.html, /Collection/);
  assert.match(result.text, /Collection point: DEIGON collection point/);
  assert.match(result.text, /Shipping: R 0\.00/);
  assert.doesNotMatch(`${result.html}\n${result.text}`, /Size:|Colour:|Delivery destination/);
});

test("processing templates preserve delivery and pickup context", () => {
  const deliveryResult = render("ORDER_PROCESSING", { ...delivery(), processingAt: "2026-10-02T09:00:00.000Z" });
  const pickupResult = render("ORDER_PROCESSING", { ...pickup(), processingAt: "2026-10-02T09:00:00.000Z" });
  assert.equal(deliveryResult.subject, "We’re preparing order DGN-EMAIL-1 — DEIGON");
  assert.match(deliveryResult.html, /We’re preparing your DEIGON order/);
  assert.match(deliveryResult.text, /prepared for delivery/);
  assert.match(pickupResult.text, /prepared for collection/);
  assert.match(pickupResult.text, /DEIGON collection point/);
});

test("shipped template includes optional ETA and destination without tracking claims", () => {
  const shipped = { ...delivery(), processingAt: "2026-10-02T09:00:00.000Z", shippedAt: "2026-10-03T08:00:00.000Z" };
  const withEta = render("ORDER_SHIPPED", shipped);
  const withoutEta = render("ORDER_SHIPPED", { ...shipped, estimatedDeliveryDate: null });
  assert.equal(withEta.subject, "Order DGN-EMAIL-1 is out for delivery — DEIGON");
  assert.match(withEta.text, /Estimated delivery: 2026-10-09/);
  assert.match(withEta.text, /1 Snapshot Street/);
  assert.doesNotMatch(withoutEta.text, /Estimated delivery/);
  assert.doesNotMatch(`${withEta.html}\n${withEta.text}`, /tracking|courier/i);
});

test("shipped template rejects pickup and requires the shipped milestone", () => {
  assert.throws(() => render("ORDER_SHIPPED", { ...pickup(), shippedAt: "2026-10-03T08:00:00.000Z" }), { name: "OrderEmailRenderError" });
  assert.throws(() => render("ORDER_SHIPPED", delivery()), { name: "OrderEmailRenderError" });
});

test("ready-for-pickup template accepts pickup, includes location and rejects delivery", () => {
  const ready = { ...pickup(), processingAt: "2026-10-02T09:00:00.000Z", readyForPickupAt: "2026-10-03T08:00:00.000Z" };
  const result = render("ORDER_READY_FOR_PICKUP", ready);
  assert.equal(result.subject, "Order DGN-EMAIL-2 is ready for collection — DEIGON");
  assert.match(result.html, /Your order is ready for collection/);
  assert.match(result.text, /Collection point: DEIGON collection point/);
  assert.throws(() => render("ORDER_READY_FOR_PICKUP", { ...delivery(), readyForPickupAt: ready.readyForPickupAt }), { name: "OrderEmailRenderError" });
});

test("completed template keeps delivered and collected language separate", () => {
  const delivered = render("ORDER_COMPLETED", { ...delivery(), deliveredAt: "2026-10-05T08:00:00.000Z" });
  const collected = render("ORDER_COMPLETED", { ...pickup(), deliveredAt: "2026-10-05T08:00:00.000Z" });
  assert.equal(delivered.subject, "Order DGN-EMAIL-1 has been delivered — DEIGON");
  assert.match(delivered.text, /Your order has been delivered/);
  assert.doesNotMatch(delivered.text, /collected/i);
  assert.equal(collected.subject, "Order DGN-EMAIL-2 has been collected — DEIGON");
  assert.match(collected.text, /Your order has been collected/);
  assert.doesNotMatch(collected.text, /delivered/i);
});

test("each event requires its authoritative milestone", () => {
  assert.throws(() => render("ORDER_CONFIRMED", { ...delivery(), confirmedAt: null }), { name: "OrderEmailRenderError" });
  assert.throws(() => render("ORDER_PROCESSING", delivery()), { name: "OrderEmailRenderError" });
  assert.throws(() => render("ORDER_READY_FOR_PICKUP", pickup()), { name: "OrderEmailRenderError" });
  assert.throws(() => render("ORDER_COMPLETED", delivery()), { name: "OrderEmailRenderError" });
});

test("dynamic HTML is escaped while plain text preserves readable snapshot text", () => {
  const hostile = delivery();
  hostile.customer.name = `<script>alert('customer')</script>`;
  hostile.orderNumber = `A&B "quoted" <Limited Edition>`;
  hostile.items[0].title = `<script>alert(1)</script> A&B "quoted"`;
  hostile.destination.addressLine1 = `<Limited Edition> & 'Suite'`;
  const result = render("ORDER_CONFIRMED", hostile);
  assert.doesNotMatch(result.html, /<script>/i);
  for (const value of ["&lt;script&gt;", "A&amp;B", "&quot;quoted&quot;", "&lt;Limited Edition&gt;", "&#39;Suite&#39;"]) {
    assert.ok(result.html.includes(value), value);
  }
  assert.match(result.text, /<script>alert\(1\)<\/script> A&B "quoted"/);
});

test("unsafe image schemes and malformed URLs are omitted without blocking rendering", () => {
  for (const imageUrl of ["javascript:alert(1)", "data:image/png;base64,AAAA", "//evil.example/image.jpg", "not a url"]) {
    const value = delivery(); value.items[0].imageUrl = imageUrl;
    const result = render("ORDER_CONFIRMED", value);
    assert.doesNotMatch(result.html, /<img\b/);
    assert.match(result.html, /Snapshot product/);
  }
  const value = delivery(); value.items[0].imageUrl = "https://images.example/item.jpg?size=small";
  assert.match(render("ORDER_CONFIRMED", value).html, /https:\/\/images\.example\/item\.jpg\?size=small/);
});

test("ZAR formatting remains exact and never uses floating point conversion", () => {
  assert.equal(app.formatOrderEmailZar("0.00"), "R 0.00");
  assert.equal(app.formatOrderEmailZar("80.00"), "R 80.00");
  assert.equal(app.formatOrderEmailZar("1299.95"), "R 1,299.95");
  assert.equal(app.formatOrderEmailZar("1000000.00"), "R 1,000,000.00");
  for (const value of ["1", "1.0", "01.00", "-1.00", "1e3"]) assert.throws(() => app.formatOrderEmailZar(value));
});

test("CTA uses the encoded authenticated order ID and a normalized trusted origin", () => {
  const value = delivery(); value.orderId = "order/id #1";
  const result = render("ORDER_CONFIRMED", value, { appOrigin: " https://www.deigon.co.za/ " });
  const expected = "https://www.deigon.co.za/account/orders/order%2Fid%20%231";
  assert.ok(result.text.includes(expected));
  assert.ok(result.html.includes(expected));
  assert.doesNotMatch(result.text, /account\/orders\/DGN-EMAIL-1/);
});

test("renderer rejects unsafe origins, unsupported versions and malformed snapshots", () => {
  for (const appOriginValue of [
    "http://www.deigon.co.za", "https://user:pass@www.deigon.co.za", "https://www.deigon.co.za/shop",
    "https://www.deigon.co.za/?next=x", "https://www.deigon.co.za/#x", "not-a-url",
  ]) assert.throws(() => render("ORDER_CONFIRMED", delivery(), { appOrigin: appOriginValue }), { name: "OrderEmailRenderError" });
  assert.throws(() => render("ORDER_CONFIRMED", delivery(), { appOrigin: null }), { name: "OrderEmailRenderError" });
  assert.throws(() => render("ORDER_CONFIRMED", delivery(), { templateVersion: 2 }), { name: "OrderEmailRenderError" });
  assert.throws(() => render("UNKNOWN_EVENT", delivery()), { name: "OrderEmailRenderError" });
  assert.throws(() => render("ORDER_CONFIRMED", { ...delivery(), unexpected: true }), { name: "OrderEmailSnapshotValidationError" });
});

test("rendering is byte-for-byte deterministic and contains no sensitive identifiers", () => {
  const first = render("ORDER_CONFIRMED", delivery());
  const second = render("ORDER_CONFIRMED", delivery());
  assert.deepEqual(second, first);
  const output = `${first.subject}\n${first.html}\n${first.text}`;
  for (const forbidden of ["providerCheckoutId", "transactionId", "paymentId", "userId", "addressId", "adminUserId"]) {
    assert.doesNotMatch(output, new RegExp(forbidden, "i"));
  }
});
