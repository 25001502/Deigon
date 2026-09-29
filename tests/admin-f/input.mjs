import assert from "node:assert/strict";
import { test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";

const app = await bundle(`export { saleMutationInput } from './lib/admin/products/sale/input';`, {
  "server-only": "",
});

const token = "2026-09-27T12:00:00.000Z";
const valid = {
  expectedUpdatedAt: token,
  salePrice: "1299.95",
  saleStartsAt: null,
  saleEndsAt: null,
};

test("accepts immediate sale and preserves Decimal cents", () => {
  const result = app.saleMutationInput(valid);
  assert.equal(result.expectedUpdatedAt, token);
  assert.equal(result.salePrice.toFixed(2), "1299.95");
  assert.equal(result.saleStartsAt, null);
  assert.equal(result.saleEndsAt, null);
});

test("accepts bounded, start-only and end-only absolute schedules", () => {
  const values = [
    { saleStartsAt: "2026-10-01T00:00:00Z", saleEndsAt: "2026-10-31T23:59:59.999Z" },
    { saleStartsAt: "2026-10-01T02:00:00+02:00", saleEndsAt: null },
    { saleStartsAt: null, saleEndsAt: "2026-10-31T21:59:59.999-02:00" },
  ];
  for (const value of values) {
    const result = app.saleMutationInput({ ...valid, ...value });
    assert.equal(result.saleStartsAt?.toISOString() ?? null, value.saleStartsAt ? new Date(value.saleStartsAt).toISOString() : null);
    assert.equal(result.saleEndsAt?.toISOString() ?? null, value.saleEndsAt ? new Date(value.saleEndsAt).toISOString() : null);
  }
});

test("accepts explicit sale clearing only with null schedule boundaries", () => {
  const result = app.saleMutationInput({ ...valid, salePrice: null });
  assert.equal(result.salePrice, null);
  assert.equal(result.saleStartsAt, null);
  assert.equal(result.saleEndsAt, null);
});

for (const [name, change] of [
  ["missing key", (value) => { const result = { ...value }; delete result.saleEndsAt; return result; }],
  ["unknown key", (value) => ({ ...value, userId: "someone" })],
  ["client role", (value) => ({ ...value, role: "ADMIN" })],
  ["variant identity", (value) => ({ ...value, variantId: "other-variant" })],
  ["base price", (value) => ({ ...value, price: "1.00" })],
  ["inventory", (value) => ({ ...value, quantity: 99 })],
  ["effective price", (value) => ({ ...value, effectivePrice: "1.00" })],
  ["sale state", (value) => ({ ...value, state: "ACTIVE" })],
  ["manual status", (value) => ({ ...value, isOnSale: true })],
  ["discount percentage", (value) => ({ ...value, discountPercentage: 20 })],
  ["client updatedAt", (value) => ({ ...value, updatedAt: token })],
]) test(`rejects non-contract payload shape: ${name}`, () => {
  assert.throws(() => app.saleMutationInput(change(valid)), { status: 400 });
});

for (const amount of [
  "0", "0.00", "-1", "1.001", "100000000", "01.00", ".50", "1.", " 1.00", "1e2", "NaN", "Infinity", 10, {},
]) test(`rejects invalid sale money ${JSON.stringify(amount)}`, () => {
  assert.throws(() => app.saleMutationInput({ ...valid, salePrice: amount }), { status: 400 });
});

for (const timestamp of [
  "2026-09-27T12:00:00", // no absolute offset
  "2026-02-30T12:00:00Z",
  "2025-02-29T12:00:00Z",
  "2026-13-01T12:00:00Z",
  "2026-09-27T24:00:00Z",
  "2026-09-27T12:60:00Z",
  "2026-09-27T12:00:60Z",
  "2026-09-27T12:00:00.0001Z",
  "2026-09-27T12:00:00+14:01",
  "2026-09-27T12:00:00+15:00",
  "0000-01-01T00:00:00Z",
  "not-a-date",
]) test(`rejects invalid sale timestamp ${timestamp}`, () => {
  assert.throws(() => app.saleMutationInput({ ...valid, saleStartsAt: timestamp }), { status: 400 });
});

test("accepts leap day and maximum legal timezone offsets", () => {
  for (const saleStartsAt of ["2028-02-29T23:59:59.999Z", "2026-09-27T12:00:00+14:00", "2026-09-27T12:00:00-14:00"]) {
    assert.ok(app.saleMutationInput({ ...valid, saleStartsAt }).saleStartsAt instanceof Date);
  }
});

test("rejects schedule boundaries when sale price is null", () => {
  for (const field of ["saleStartsAt", "saleEndsAt"]) {
    assert.throws(() => app.saleMutationInput({ ...valid, salePrice: null, [field]: "2026-10-01T00:00:00Z" }), { status: 400 });
  }
});

test("rejects equal and reversed schedule boundaries by instant", () => {
  for (const saleEndsAt of ["2026-10-01T00:00:00Z", "2026-09-30T23:59:59.999Z", "2026-10-01T02:00:00+02:00"]) {
    assert.throws(() => app.saleMutationInput({
      ...valid,
      saleStartsAt: "2026-10-01T00:00:00Z",
      saleEndsAt,
    }), { status: 400 });
  }
});

test("requires the exact canonical optimistic concurrency timestamp", () => {
  for (const expectedUpdatedAt of ["2026-09-27T12:00:00Z", "2026-09-27T14:00:00.000+02:00", "yesterday", null]) {
    assert.throws(() => app.saleMutationInput({ ...valid, expectedUpdatedAt }), { status: 400 });
  }
});
