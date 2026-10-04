import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";

let callbacks;
let dispatches;
let result;
let transitionResult;
let failDispatch;
let dispatchSummary;

globalThis.__orderEmailAfter = {
  after(callback) { callbacks.push(callback); },
  verify() { return { trusted: true }; },
  process() { return Promise.resolve(result); },
  transition() { return Promise.resolve(transitionResult); },
  dispatch(options) {
    dispatches.push(options);
    if (failDispatch) throw new Error("PRIVATE provider and database detail");
    return Promise.resolve(dispatchSummary);
  },
};

const nextBoundary = `
  export const after = callback => globalThis.__orderEmailAfter.after(callback);
  export const NextResponse = { json: (value, init) => Response.json(value, init) };
`;
const dispatchBoundary = `export const dispatchOrderEmails = options => globalThis.__orderEmailAfter.dispatch(options);`;

const webhook = await bundle(`export { POST } from './app/api/webhooks/yoco/route';`, {
  "next/server": nextBoundary,
  "@/lib/email/dispatch-order-emails": dispatchBoundary,
  "@/lib/payments/yoco-webhook": `
    export class YocoWebhookVerificationError extends Error {}
    export const verifyYocoWebhook = () => globalThis.__orderEmailAfter.verify();
  `,
  "@/lib/payments/process-yoco-webhook": `
    export class YocoWebhookProcessingError extends Error {}
    export const processYocoWebhook = () => globalThis.__orderEmailAfter.process();
  `,
});

const fulfilment = await bundle(`export { PATCH } from './app/api/admin/orders/[orderId]/fulfilment/route';`, {
  "next/server": nextBoundary,
  "@/lib/email/dispatch-order-emails": dispatchBoundary,
  "@/lib/auth/require-admin": "export const requireAdmin = async () => ({ id: 'admin' });",
  "@/lib/admin/orders/mutations": "export const transitionAdminOrder = (...args) => globalThis.__orderEmailAfter.transition(...args);",
  "@/lib/admin/orders/http": `
    export const mutationBody = async request => request.json();
    export const success = data => Response.json({ ok: true, data });
    export const failure = error => Response.json({ ok: false, message: 'failed' }, { status: error?.status ?? 500 });
  `,
});

beforeEach(() => {
  callbacks = [];
  dispatches = [];
  result = "processed";
  transitionResult = { id: "safe-order-detail", status: "PROCESSING" };
  failDispatch = false;
  dispatchSummary = {
    examined: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    staleRecovered: 0,
    lostClaims: 0,
    configurationBlocked: false,
  };
});

async function invokeCallbacks() {
  const originalError = console.error;
  const errors = [];
  console.error = (...values) => errors.push(values);
  try {
    for (const callback of callbacks) await callback();
  } finally {
    console.error = originalError;
  }
  return errors;
}

test("processed webhook responds normally and registers one small durable dispatch callback", async () => {
  const response = await webhook.POST(new Request("https://www.deigon.co.za/api/webhooks/yoco", { method: "POST", body: "{}" }));
  assert.deepEqual(await response.json(), { ok: true, result: "processed" });
  assert.equal(callbacks.length, 1);
  assert.equal(dispatches.length, 0);
  assert.deepEqual(await invokeCallbacks(), []);
  assert.deepEqual(dispatches, [{ limit: 1 }]);
});

test("ignored and duplicate webhook outcomes do not schedule email dispatch", async () => {
  for (const value of ["ignored", "duplicate"]) {
    callbacks = [];
    result = value;
    const response = await webhook.POST(new Request("https://www.deigon.co.za/api/webhooks/yoco", { method: "POST", body: "{}" }));
    assert.deepEqual(await response.json(), { ok: true, result: value });
    assert.equal(callbacks.length, 0);
  }
});

test("webhook background failure cannot alter the already successful response", async () => {
  failDispatch = true;
  const response = await webhook.POST(new Request("https://www.deigon.co.za/api/webhooks/yoco", { method: "POST", body: "{}" }));
  assert.deepEqual(await response.json(), { ok: true, result: "processed" });
  const errors = await invokeCallbacks();
  assert.deepEqual(errors, [["Order email background dispatch failed."]]);
});

test("successful admin fulfilment responds normally and registers one dispatcher callback", async () => {
  const response = await fulfilment.PATCH(
    new Request("https://www.deigon.co.za/api/admin/orders/order-1/fulfilment", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetStatus: "PROCESSING" }),
    }),
    { params: Promise.resolve({ orderId: "order-1" }) },
  );
  assert.deepEqual(await response.json(), { ok: true, data: transitionResult });
  assert.equal(callbacks.length, 1);
  assert.deepEqual(await invokeCallbacks(), []);
  assert.deepEqual(dispatches, [{ limit: 1 }]);
});

test("admin background failure cannot alter the successful fulfilment response", async () => {
  failDispatch = true;
  const response = await fulfilment.PATCH(
    new Request("https://www.deigon.co.za/api/admin/orders/order-1/fulfilment", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: "{}",
    }),
    { params: Promise.resolve({ orderId: "order-1" }) },
  );
  assert.equal(response.status, 200);
  const errors = await invokeCallbacks();
  assert.deepEqual(errors, [["Order email background dispatch failed."]]);
});

test("webhook and fulfilment callbacks emit aggregate-only errors for newly dead-lettered events", async () => {
  dispatchSummary = { ...dispatchSummary, examined: 1, dead: 1 };
  const webhookResponse = await webhook.POST(new Request(
    "https://www.deigon.co.za/api/webhooks/yoco",
    { method: "POST", body: "{}" },
  ));
  assert.equal(webhookResponse.status, 200);
  const webhookErrors = await invokeCallbacks();
  assert.deepEqual(webhookErrors, [[
    "Order email background dispatch dead-lettered events.",
    { examined: 1, dead: 1 },
  ]]);

  callbacks = [];
  dispatches = [];
  const fulfilmentResponse = await fulfilment.PATCH(
    new Request("https://www.deigon.co.za/api/admin/orders/order-1/fulfilment", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: "{}",
    }),
    { params: Promise.resolve({ orderId: "order-1" }) },
  );
  assert.equal(fulfilmentResponse.status, 200);
  const fulfilmentErrors = await invokeCallbacks();
  assert.deepEqual(fulfilmentErrors, [[
    "Order email background dispatch dead-lettered events.",
    { examined: 1, dead: 1 },
  ]]);

  const serialized = JSON.stringify([webhookErrors, fulfilmentErrors]);
  for (const forbidden of ["recipient", "orderId", "outbox", "provider", "payload", "claimToken", "secret"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }
});
