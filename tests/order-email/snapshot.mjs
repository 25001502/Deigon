import assert from "node:assert/strict";
import { test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";

const app = await bundle(`
  export * from './lib/email/order-email-types';
  export * from './lib/email/order-email-snapshot';
`, { "server-only": "" });

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

test("B1 exports the locked lifecycle and status contracts", () => {
  assert.equal(app.ORDER_EMAIL_TEMPLATE_VERSION, 1);
  assert.deepEqual(app.ORDER_EMAIL_EVENT_TYPES, [
    "ORDER_CONFIRMED", "ORDER_PROCESSING", "ORDER_SHIPPED", "ORDER_READY_FOR_PICKUP", "ORDER_COMPLETED",
  ]);
  assert.deepEqual(app.ORDER_EMAIL_STATUSES, ["PENDING", "SENDING", "SENT", "DEAD"]);
});

test("validator accepts a complete DELIVERY snapshot with exact money", () => {
  assert.deepEqual(app.parseOrderEmailSnapshotV1(delivery()), delivery());
});

test("validator accepts PICKUP, zero shipping and nullable variant presentation", () => {
  assert.deepEqual(app.parseOrderEmailSnapshotV1(pickup()), pickup());
});

test("validator normalizes safe recipient whitespace without changing address case", () => {
  assert.deepEqual(app.normalizeOrderEmailRecipient({
    recipientEmail: "  Customer@Example.invalid  ", recipientName: "  Customer One  ",
  }), { recipientEmail: "Customer@Example.invalid", recipientName: "Customer One" });
});

test("validator rejects missing, unknown and sensitive snapshot fields", () => {
  const missing = delivery(); delete missing.orderNumber;
  const unknown = { ...delivery(), note: "unexpected" };
  const sensitive = { ...delivery(), transactionId: "provider-secret" };
  for (const value of [missing, unknown, sensitive]) assert.throws(() => app.parseOrderEmailSnapshotV1(value), { name: "OrderEmailSnapshotValidationError" });
});

test("validator rejects malformed or non-canonical money", () => {
  for (const subtotal of ["250", "250.0", "0250.00", "-1.00", "1e2", "NaN", 250]) {
    assert.throws(() => app.parseOrderEmailSnapshotV1({ ...delivery(), subtotal }), { name: "OrderEmailSnapshotValidationError" });
  }
});

test("validator rejects inconsistent line, subtotal and total arithmetic", () => {
  const badLine = delivery(); badLine.items[0].lineTotal = "249.99";
  for (const value of [badLine, { ...delivery(), subtotal: "249.99" }, { ...delivery(), total: "329.99" }]) {
    assert.throws(() => app.parseOrderEmailSnapshotV1(value), { name: "OrderEmailSnapshotValidationError" });
  }
});

test("validator rejects zero, negative, fractional and oversized quantities", () => {
  for (const quantity of [0, -1, 1.5, 1_000_001, "2"]) {
    const value = delivery(); value.items[0].quantity = quantity;
    assert.throws(() => app.parseOrderEmailSnapshotV1(value), { name: "OrderEmailSnapshotValidationError" });
  }
});

test("validator rejects destination branches inconsistent with fulfilment type", () => {
  assert.throws(() => app.parseOrderEmailSnapshotV1({ ...delivery(), destination: pickup().destination }), { name: "OrderEmailSnapshotValidationError" });
  assert.throws(() => app.parseOrderEmailSnapshotV1({ ...pickup(), destination: delivery().destination }), { name: "OrderEmailSnapshotValidationError" });
});

test("validator rejects recipient header injection and implausible addresses", () => {
  for (const recipientEmail of [
    "victim@example.invalid\r\nBcc: attacker@example.invalid",
    "first@example.invalid,second@example.invalid",
    "Customer <customer@example.invalid>",
    "missing-at.example.invalid",
    "a@b",
    `${"a".repeat(310)}@example.invalid`,
  ]) {
    assert.throws(() => app.normalizeOrderEmailRecipient({ recipientEmail, recipientName: "Customer" }), { name: "OrderEmailSnapshotValidationError" });
  }
  assert.throws(() => app.normalizeOrderEmailRecipient({ recipientEmail: "valid@example.invalid", recipientName: "Customer\nBcc" }), { name: "OrderEmailSnapshotValidationError" });
});

test("validator rejects malformed timestamps, dates and payload versions", () => {
  for (const createdAt of ["2026-10-02", "2026-02-30T08:00:00.000Z", "2026-10-02T08:00:00Z", "not-a-date"]) {
    assert.throws(() => app.parseOrderEmailSnapshotV1({ ...delivery(), createdAt }), { name: "OrderEmailSnapshotValidationError" });
  }
  for (const estimatedDeliveryDate of ["2026-02-30", "2026-10-02T00:00:00.000Z", "tomorrow"]) {
    assert.throws(() => app.parseOrderEmailSnapshotV1({ ...delivery(), estimatedDeliveryDate }), { name: "OrderEmailSnapshotValidationError" });
  }
  assert.throws(() => app.parseOrderEmailSnapshotV1({ ...delivery(), version: 2 }), { name: "OrderEmailSnapshotValidationError" });
});
