// Run: node --test tests/phase-6a/yoco-client.mjs
// No database connections, env-file loading, or real provider requests.
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Follow the Phase 5 harness pattern; only replace Next's build-time server marker.
const bundle = await build({
  absWorkingDir: root,
  entryPoints: ["lib/payments/yoco.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  plugins: [{
    name: "server-only-test-marker",
    setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({
        path: "server-only", namespace: "test-marker",
      }));
      builder.onLoad({ filter: /.*/, namespace: "test-marker" }, () => ({ contents: "" }));
    },
  }],
});
const loaded = new Module(path.join(root, "phase-6a-test-bundle.cjs"));
loaded.filename = path.join(root, "phase-6a-test-bundle.cjs");
loaded.paths = Module._nodeModulePaths(root);
loaded._compile(bundle.outputFiles[0].text, loaded.filename);
const { createYocoCheckout, decimalToCents, YocoCheckoutError } = loaded.exports;

const originalKey = process.env.YOCO_SECRET_KEY;
const fakeKey = "sk_test_fake_phase6a_only";
const privateBody = "private-provider-details";
const input = {
  amount: new Prisma.Decimal("480.50"),
  idempotencyKey: "deigon-yoco-test-order-id",
  successUrl: "https://shop.example/success",
  cancelUrl: "https://shop.example/cancel",
  failureUrl: "https://shop.example/failure",
  externalId: "test-order-id",
  metadata: { orderNumber: "DGN-TEST" },
};

beforeEach(() => {
  process.env.YOCO_SECRET_KEY = fakeKey;
  mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected fetch in isolated test");
  });
});

afterEach(() => {
  mock.restoreAll();
  if (originalKey === undefined) delete process.env.YOCO_SECRET_KEY;
  else process.env.YOCO_SECRET_KEY = originalKey;
});

function controlledError(code, statusCode) {
  return (error) => {
    assert.ok(error instanceof YocoCheckoutError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.cause, undefined);
    assert.ok(!String(error.stack).includes(fakeKey));
    assert.ok(!String(error.stack).includes(privateBody));
    return true;
  };
}

test("Decimal conversion preserves cents including floating-point traps and the safe boundary", () => {
  for (const [rand, cents] of [
    ["400.00", 40000], ["480.50", 48050], ["80.00", 8000],
    ["0.01", 1], ["1.0050", null], ["0.29", 29], ["1.10", 110],
    ["99999999.99", 9999999999], ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ]) {
    if (cents === null) assert.throws(() => decimalToCents(new Prisma.Decimal(rand)), controlledError("INVALID_INPUT"));
    else assert.equal(decimalToCents(new Prisma.Decimal(rand)), cents);
  }
});

test("rejects non-positive, fractional cents, non-finite, unsafe, and non-Decimal amounts", () => {
  for (const value of ["0", "-0", "-1", "0.001", "480.501", "NaN", "Infinity", "-Infinity", "90071992547409.92", "1e100000"]) {
    assert.throws(() => decimalToCents(new Prisma.Decimal(value)), controlledError("INVALID_INPUT"));
  }
  assert.throws(() => decimalToCents(400), controlledError("INVALID_INPUT"));
});

test("sends the exact hosted-checkout contract and reuses the supplied idempotency key", async () => {
  const requests = [];
  globalThis.fetch.mock.mockImplementation(async (url, options) => {
    requests.push({ url, options });
    return Response.json({ id: "checkout_test", redirectUrl: "https://c.yoco.com/checkout/test", extra: privateBody });
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.deepEqual(await createYocoCheckout(input), {
      checkoutId: "checkout_test", redirectUrl: "https://c.yoco.com/checkout/test",
    });
  }
  assert.equal(requests.length, 2);
  for (const { url, options } of requests) {
    assert.equal(url, "https://payments.yoco.com/api/checkouts");
    assert.equal(options.method, "POST");
    assert.deepEqual(options.headers, {
      Authorization: `Bearer ${fakeKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    });
    assert.deepEqual(JSON.parse(options.body), {
      amount: 48050,
      currency: "ZAR",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      failureUrl: input.failureUrl,
      metadata: input.metadata,
      externalId: input.externalId,
    });
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test("missing or blank configuration fails before HTTP", async () => {
  for (const value of [undefined, "", "   "]) {
    if (value === undefined) delete process.env.YOCO_SECRET_KEY;
    else process.env.YOCO_SECRET_KEY = value;
    await assert.rejects(createYocoCheckout(input), controlledError("CONFIGURATION"));
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("rejects invalid request values before HTTP", async () => {
  for (const override of [
    { amount: new Prisma.Decimal("0.001") },
    { idempotencyKey: "" }, { idempotencyKey: " " }, { idempotencyKey: "key\r\nInjected: value" },
    { successUrl: "/relative" }, { cancelUrl: "javascript:alert(1)" }, { failureUrl: "https://user:pass@shop.example" },
  ]) {
    await assert.rejects(createYocoCheckout({ ...input, ...override }), controlledError("INVALID_INPUT"));
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("network failures discard sensitive original errors", async () => {
  globalThis.fetch.mock.mockImplementation(async () => { throw new Error(`${fakeKey} ${privateBody}`); });
  await assert.rejects(createYocoCheckout(input), controlledError("NETWORK"));
});

test("timeouts use a controlled error", async () => {
  mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 15000);
    return AbortSignal.abort(new Error(privateBody));
  });
  await assert.rejects(createYocoCheckout(input), controlledError("TIMEOUT"));
});

test("non-2xx responses expose only the status code", async () => {
  for (const status of [302, 400, 401, 403, 409, 422, 429, 500]) {
    globalThis.fetch.mock.mockImplementation(async () => new Response(`${privateBody} ${fakeKey}`, { status }));
    await assert.rejects(createYocoCheckout(input), controlledError("PROVIDER", status));
  }
});

test("malformed JSON and interrupted response bodies are controlled", async () => {
  globalThis.fetch.mock.mockImplementation(async () => new Response(`{ ${privateBody} ${fakeKey}`));
  await assert.rejects(createYocoCheckout(input), controlledError("INVALID_RESPONSE"));
  mock.method(AbortSignal, "timeout", () => AbortSignal.abort());
  await assert.rejects(createYocoCheckout(input), controlledError("TIMEOUT"));
});

test("requires an ID and an absolute HTTPS redirect URL", async () => {
  for (const response of [
    null, [], {}, { id: "checkout_test" },
    { redirectUrl: "https://c.yoco.com/test" },
    { id: " ", redirectUrl: "https://c.yoco.com/test" },
    { id: 1, redirectUrl: "https://c.yoco.com/test" },
    ...[null, "", "/relative", "javascript:alert(1)", "http://c.yoco.com/test", "https://user:pass@c.yoco.com/test"].map(
      (redirectUrl) => ({ id: "checkout_test", redirectUrl }),
    ),
  ]) {
    globalThis.fetch.mock.mockImplementation(async () => Response.json(response));
    await assert.rejects(createYocoCheckout(input), controlledError("INVALID_RESPONSE"));
  }
});
