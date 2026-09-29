import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { build } from "esbuild";

import { root } from "../admin-a/support/bundle.mjs";

const result = await build({
  absWorkingDir: root,
  entryPoints: ["lib/pricing/resolve-variant-price.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  plugins: [{
    name: "server-only-test-marker",
    setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "test-marker" }));
      builder.onLoad({ filter: /.*/, namespace: "test-marker" }, () => ({ contents: "" }));
    },
  }],
});
const loaded = new Module(path.join(root, "admin-f-resolver-test.cjs"));
loaded.filename = path.join(root, "admin-f-resolver-test.cjs");
loaded.paths = Module._nodeModulePaths(root);
loaded._compile(result.outputFiles[0].text, loaded.filename);
const { resolveVariantPrice, VariantPricingInvariantError } = loaded.exports;

const normal = new Prisma.Decimal("1499.99");
const sale = new Prisma.Decimal("1199.95");
const instant = (value) => new Date(value);
const input = (overrides = {}) => ({
  price: normal,
  salePrice: sale,
  saleStartsAt: null,
  saleEndsAt: null,
  ...overrides,
});

function assertState(result, state, effectivePrice) {
  assert.equal(result.state, state);
  assert.equal(result.isOnSale, state === "ACTIVE");
  assert.ok(result.normalPrice instanceof Prisma.Decimal);
  assert.ok(result.effectivePrice instanceof Prisma.Decimal);
  assert.equal(result.normalPrice.toString(), "1499.99");
  assert.equal(result.effectivePrice.toString(), effectivePrice);
}

test("no sale resolves to NONE and preserves the normal Decimal", () => {
  assertState(resolveVariantPrice(input({ salePrice: null }), instant("2026-09-26T12:00:00.000Z")), "NONE", "1499.99");
});

test("immediate sale without boundaries resolves ACTIVE", () => {
  assertState(resolveVariantPrice(input(), instant("2026-09-26T12:00:00.000Z")), "ACTIVE", "1199.95");
});

test("a future start is SCHEDULED", () => {
  assertState(resolveVariantPrice(input({ saleStartsAt: instant("2026-09-26T13:00:00.000Z") }), instant("2026-09-26T12:59:59.999Z")), "SCHEDULED", "1499.99");
});

test("the exact start instant is ACTIVE", () => {
  assertState(resolveVariantPrice(input({ saleStartsAt: instant("2026-09-26T13:00:00.000Z") }), instant("2026-09-26T13:00:00.000Z")), "ACTIVE", "1199.95");
});

test("a start-only sale stays ACTIVE after its start", () => {
  assertState(resolveVariantPrice(input({ saleStartsAt: instant("2026-09-26T13:00:00.000Z") }), instant("2026-10-01T00:00:00.000Z")), "ACTIVE", "1199.95");
});

test("an end-only sale is ACTIVE before its end", () => {
  assertState(resolveVariantPrice(input({ saleEndsAt: instant("2026-09-26T13:00:00.000Z") }), instant("2026-09-26T12:59:59.999Z")), "ACTIVE", "1199.95");
});

test("the exact end instant is EXPIRED", () => {
  assertState(resolveVariantPrice(input({ saleEndsAt: instant("2026-09-26T13:00:00.000Z") }), instant("2026-09-26T13:00:00.000Z")), "EXPIRED", "1499.99");
});

test("an end-only sale is EXPIRED after its end", () => {
  assertState(resolveVariantPrice(input({ saleEndsAt: instant("2026-09-26T13:00:00.000Z") }), instant("2026-09-26T13:00:00.001Z")), "EXPIRED", "1499.99");
});

test("a bounded sale is ACTIVE strictly inside its half-open interval", () => {
  assertState(resolveVariantPrice(input({ saleStartsAt: instant("2026-09-26T12:00:00.000Z"), saleEndsAt: instant("2026-09-26T14:00:00.000Z") }), instant("2026-09-26T13:00:00.000Z")), "ACTIVE", "1199.95");
});

test("equivalent UTC instants resolve identically without local-time interpretation", () => {
  const scheduled = input({ saleStartsAt: instant("2026-09-26T12:00:00.000Z") });
  assertState(resolveVariantPrice(scheduled, instant("2026-09-26T13:59:59.999+02:00")), "SCHEDULED", "1499.99");
  assertState(resolveVariantPrice(scheduled, instant("2026-09-26T14:00:00.000+02:00")), "ACTIVE", "1199.95");
});

test("resolver preserves Decimal cents without Number conversion", () => {
  const result = resolveVariantPrice(input(), instant("2026-09-26T12:00:00.000Z"));
  assert.ok(Prisma.Decimal.isDecimal(result.normalPrice));
  assert.ok(Prisma.Decimal.isDecimal(result.effectivePrice));
  assert.equal(result.normalPrice.minus(result.effectivePrice).toString(), "300.04");
});

for (const [name, value] of [
  ["zero sale price", input({ salePrice: new Prisma.Decimal("0") })],
  ["negative sale price", input({ salePrice: new Prisma.Decimal("-1") })],
  ["sale price equal to normal", input({ salePrice: new Prisma.Decimal("1499.99") })],
  ["sale price above normal", input({ salePrice: new Prisma.Decimal("1500.00") })],
  ["equal schedule boundaries", input({ saleStartsAt: instant("2026-09-26T12:00:00.000Z"), saleEndsAt: instant("2026-09-26T12:00:00.000Z") })],
  ["reversed schedule boundaries", input({ saleStartsAt: instant("2026-09-26T13:00:00.000Z"), saleEndsAt: instant("2026-09-26T12:00:00.000Z") })],
  ["schedule without sale", input({ salePrice: null, saleStartsAt: instant("2026-09-26T12:00:00.000Z") })],
]) {
  test(`invalid configuration fails closed: ${name}`, () => {
    assert.throws(() => resolveVariantPrice(value, instant("2026-09-26T12:00:00.000Z")), VariantPricingInvariantError);
  });
}

test("invalid input instants fail closed", () => {
  assert.throws(() => resolveVariantPrice(input(), new Date("invalid")), VariantPricingInvariantError);
  assert.throws(() => resolveVariantPrice(input({ saleStartsAt: new Date("invalid") }), instant("2026-09-26T12:00:00.000Z")), VariantPricingInvariantError);
  assert.throws(() => resolveVariantPrice(input({ saleEndsAt: new Date("invalid") }), instant("2026-09-26T12:00:00.000Z")), VariantPricingInvariantError);
});
