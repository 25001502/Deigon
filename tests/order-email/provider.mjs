import assert from "node:assert/strict";
import { test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";

const app = await bundle(`
  export * from './lib/email/provider';
  export * from './lib/email/resend-provider';
`, { "server-only": "" });

const input = (overrides = {}) => ({
  to: "customer@example.invalid",
  subject: "Order confirmed",
  html: "<p>Confirmed</p>",
  text: "Confirmed",
  idempotencyKey: "deigon/order-email/v1/outbox-1",
  ...overrides,
});

function fake(response) {
  const calls = [];
  return {
    calls,
    client: {
      emails: {
        async send(payload, options) {
          calls.push({ payload, options });
          if (response instanceof Error) throw response;
          return typeof response === "function" ? response(payload, options) : response;
        },
      },
    },
  };
}

test("provider sends the fixed identity and normalizes a successful message ID", async () => {
  const boundary = fake({ data: { id: " email-provider-1 " }, error: null, headers: {} });
  const provider = app.createResendEmailProviderFromClient(boundary.client);
  const result = await provider.send({ ...input(), from: "attacker@example.invalid", replyTo: "attacker@example.invalid" });
  assert.deepEqual(result, { ok: true, providerMessageId: "email-provider-1" });
  assert.deepEqual(boundary.calls, [{
    payload: {
      from: "DEIGON <orders@deigon.co.za>",
      to: "customer@example.invalid",
      subject: "Order confirmed",
      html: "<p>Confirmed</p>",
      text: "Confirmed",
    },
    options: { idempotencyKey: "deigon/order-email/v1/outbox-1" },
  }]);
});

test("provider passes the caller AbortSignal through without creating timeout behavior", async () => {
  const boundary = fake({ data: { id: "email-provider-2" }, error: null, headers: null });
  const signal = new AbortController().signal;
  await app.createResendEmailProviderFromClient(boundary.client).send(input({ signal }));
  assert.equal(boundary.calls[0].options.signal, signal);
});

test("outbox idempotency keys are deterministic, stable, distinct and bounded", () => {
  assert.equal(app.orderEmailProviderIdempotencyKey("outbox-1"), "deigon/order-email/v1/outbox-1");
  assert.equal(app.orderEmailProviderIdempotencyKey("outbox-1"), app.orderEmailProviderIdempotencyKey("outbox-1"));
  assert.notEqual(app.orderEmailProviderIdempotencyKey("outbox-1"), app.orderEmailProviderIdempotencyKey("outbox-2"));
  assert.throws(() => app.orderEmailProviderIdempotencyKey(""));
  assert.throws(() => app.orderEmailProviderIdempotencyKey("contains space"));
  assert.throws(() => app.orderEmailProviderIdempotencyKey("x".repeat(256)));
});

test("representative Resend failures map to provider-independent classifications", async () => {
  const cases = [
    ["rate_limit_exceeded", 429, "RETRYABLE"],
    ["internal_server_error", 500, "RETRYABLE"],
    ["application_error", 503, "RETRYABLE"],
    ["validation_error", 422, "PERMANENT"],
    ["invalid_api_key", 401, "CONFIGURATION"],
    ["invalid_access", 403, "CONFIGURATION"],
    ["invalid_idempotent_request", 409, "IDEMPOTENCY_CONFLICT"],
    ["concurrent_idempotent_requests", 409, "RETRYABLE"],
    ["monthly_quota_exceeded", 429, "CONFIGURATION"],
  ];
  for (const [name, statusCode, kind] of cases) {
    const boundary = fake({ data: null, error: { name, statusCode, message: "private provider detail" }, headers: {} });
    const result = await app.createResendEmailProviderFromClient(boundary.client).send(input());
    assert.deepEqual(result, { ok: false, kind, code: name, statusCode, retryAfterSeconds: null });
    assert.doesNotMatch(JSON.stringify(result), /private provider detail|customer@example/i);
  }
});

test("status code provides safe fallback classification for unknown provider errors", async () => {
  for (const [statusCode, kind] of [
    [null, "RETRYABLE"],
    [408, "RETRYABLE"],
    [425, "RETRYABLE"],
    [500, "RETRYABLE"],
    [503, "RETRYABLE"],
    [422, "PERMANENT"],
    [401, "CONFIGURATION"],
    [403, "CONFIGURATION"],
  ]) {
    const boundary = fake({ data: null, error: { name: "future_private_error", statusCode, message: "secret body" }, headers: null });
    const result = await app.createResendEmailProviderFromClient(boundary.client).send(input());
    assert.deepEqual(result, {
      ok: false,
      kind,
      code: statusCode === null ? "provider_error" : `http_${statusCode}`,
      statusCode,
      retryAfterSeconds: null,
    });
  }
});

test("Retry-After accepts a bounded positive seconds header only", async () => {
  for (const [header, expected] of [["12", 12], ["0", null], ["-1", null], ["1.5", null], ["tomorrow", null], ["86401", null]]) {
    const boundary = fake({
      data: null,
      error: { name: "rate_limit_exceeded", statusCode: 429, message: "rate limited" },
      headers: { "Retry-After": header },
    });
    const result = await app.createResendEmailProviderFromClient(boundary.client).send(input());
    assert.equal(result.retryAfterSeconds, expected);
  }
});

test("network exceptions become private retryable failures", async () => {
  const boundary = fake(new Error("socket detail containing recipient and key"));
  const result = await app.createResendEmailProviderFromClient(boundary.client).send(input());
  assert.deepEqual(result, {
    ok: false,
    kind: "RETRYABLE",
    code: "network_error",
    statusCode: null,
    retryAfterSeconds: null,
  });
  assert.doesNotMatch(JSON.stringify(result), /socket|recipient|key/i);
});

test("missing provider message IDs fail safely for idempotent retry", async () => {
  for (const data of [{}, { id: "" }, { id: "   " }, null]) {
    const boundary = fake({ data, error: null, headers: null });
    assert.deepEqual(await app.createResendEmailProviderFromClient(boundary.client).send(input()), {
      ok: false,
      kind: "RETRYABLE",
      code: "invalid_provider_response",
      statusCode: null,
      retryAfterSeconds: null,
    });
  }
});

test("production factory reads configuration lazily and fails closed without a key", () => {
  assert.throws(() => app.createResendEmailProvider(() => undefined), { name: "EmailConfigurationError" });
  assert.throws(() => app.createResendEmailProvider(() => "   "), { name: "EmailConfigurationError" });
  assert.doesNotThrow(() => app.createResendEmailProvider(() => "re_test_fake_key_never_sent"));
});
