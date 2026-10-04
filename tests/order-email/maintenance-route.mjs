import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";

const originalSecret = process.env.DEIGON_MAINTENANCE_SECRET;
const originalSchedulerSecret = process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET;
const secret = "order-email-maintenance-test-secret-0000000000";
const schedulerSecret = "order-email-scheduler-test-secret-00000000000";
const safeSummary = {
  examined: 3, sent: 1, retried: 1, dead: 1,
  staleRecovered: 0, lostClaims: 0, configurationBlocked: false,
};
let calls;
let expiryCalls;
let mode;
let app;

globalThis.__orderEmailMaintenance = {
  async dispatch() {
    calls += 1;
    if (mode === "throw") throw new Error(`PRIVATE ${secret} provider detail`);
    if (mode === "configuration") return { ...safeSummary, configurationBlocked: true };
    return safeSummary;
  },
  async expire() {
    expiryCalls += 1;
    return { examined: 0, expired: 0, providerBacked: 0, skipped: 0 };
  },
};

app = await bundle(`
  export { POST as emailPOST } from './app/api/internal/maintenance/send-order-emails/route';
  export { POST as expiryPOST } from './app/api/internal/maintenance/expire-unpaid-orders/route';
  export { POST as schedulerPOST } from './app/api/internal/scheduler/send-order-emails/route';
`, {
  "server-only": "",
  "@/lib/email/dispatch-order-emails": `
    export const dispatchOrderEmails = () => globalThis.__orderEmailMaintenance.dispatch();
  `,
  "@/lib/orders/expire-unpaid-orders": `
    export const expireUnpaidOrders = () => globalThis.__orderEmailMaintenance.expire();
  `,
  "@/lib/orders/unpaid-order-expiry-config": `
    export class UnpaidOrderExpiryConfigError extends Error {}
    export const getUnpaidOrderTtlMinutes = () => 30;
  `,
});

beforeEach(() => {
  calls = 0;
  expiryCalls = 0;
  mode = "success";
  process.env.DEIGON_MAINTENANCE_SECRET = secret;
  process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET = schedulerSecret;
});

after(() => {
  if (originalSecret === undefined) delete process.env.DEIGON_MAINTENANCE_SECRET;
  else process.env.DEIGON_MAINTENANCE_SECRET = originalSecret;
  if (originalSchedulerSecret === undefined) delete process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET;
  else process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET = originalSchedulerSecret;
  delete globalThis.__orderEmailMaintenance;
});

async function post(authorization) {
  return postTo(
    app.emailPOST,
    "https://www.deigon.co.za/api/internal/maintenance/send-order-emails",
    authorization,
  );
}

async function postTo(handler, url, authorization) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  const response = await handler(new Request(url, { method: "POST", headers }));
  return { status: response.status, body: await response.json() };
}

test("weak or missing maintenance configuration returns 503 before dispatcher construction", async () => {
  for (const value of [undefined, "", "too-short"]) {
    if (value === undefined) delete process.env.DEIGON_MAINTENANCE_SECRET;
    else process.env.DEIGON_MAINTENANCE_SECRET = value;
    assert.deepEqual(await post(`Bearer ${secret}`), {
      status: 503,
      body: { ok: false, message: "Maintenance is not configured." },
    });
  }
  assert.equal(calls, 0);
});

test("missing and incorrect bearer authorization are rejected before dispatch", async () => {
  assert.deepEqual(await post(undefined), {
    status: 401,
    body: { ok: false, message: "Maintenance authorization required." },
  });
  assert.deepEqual(await post("Bearer wrong-secret"), {
    status: 403,
    body: { ok: false, message: "Maintenance authorization failed." },
  });
  assert.equal(calls, 0);
});

test("scheduler and maintenance secrets cannot cross-authorize internal endpoints", async () => {
  assert.deepEqual(await post(`Bearer ${schedulerSecret}`), {
    status: 403,
    body: { ok: false, message: "Maintenance authorization failed." },
  });
  assert.deepEqual(await postTo(
    app.expiryPOST,
    "https://www.deigon.co.za/api/internal/maintenance/expire-unpaid-orders",
    `Bearer ${schedulerSecret}`,
  ), {
    status: 403,
    body: { ok: false, message: "Maintenance authorization failed." },
  });
  assert.deepEqual(await postTo(
    app.schedulerPOST,
    "https://www.deigon.co.za/api/internal/scheduler/send-order-emails",
    `Bearer ${secret}`,
  ), {
    status: 403,
    body: { ok: false, message: "Order email scheduler authorization failed." },
  });
  assert.equal(calls, 0);
  assert.equal(expiryCalls, 0);
});

test("valid maintenance authorization returns only aggregate dispatcher counts", async () => {
  const result = await post(`Bearer ${secret}`);
  assert.deepEqual(result, { status: 200, body: { ok: true, summary: safeSummary } });
  assert.equal(calls, 1);
  const serialized = JSON.stringify(result);
  for (const forbidden of [secret, "recipient", "orderId", "providerMessageId", "claimToken", "payload"]) {
    assert.ok(!serialized.includes(forbidden));
  }
});

test("provider configuration blockage becomes a controlled safe 503", async () => {
  mode = "configuration";
  assert.deepEqual(await post(`Bearer ${secret}`), {
    status: 503,
    body: { ok: false, message: "Email delivery is temporarily unavailable." },
  });
  assert.equal(calls, 1);
});

test("dispatcher exceptions become a generic 503 without private data", async () => {
  mode = "throw";
  const result = await post(`Bearer ${secret}`);
  assert.deepEqual(result, {
    status: 503,
    body: { ok: false, message: "Email delivery is temporarily unavailable." },
  });
  assert.ok(!JSON.stringify(result).includes(secret));
});
