import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";

const originalSchedulerSecret = process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET;
const originalMaintenanceSecret = process.env.DEIGON_MAINTENANCE_SECRET;
const schedulerSecret = "order-email-scheduler-test-secret-00000000000";
const maintenanceSecret = "order-email-maintenance-test-secret-0000000000";
const safeSummary = {
  examined: 2, sent: 1, retried: 1, dead: 0,
  staleRecovered: 0, lostClaims: 0, configurationBlocked: false,
};
let calls;
let options;
let mode;

globalThis.__orderEmailScheduler = {
  async dispatch(value) {
    calls += 1;
    options = value;
    if (mode === "throw") throw new Error(`PRIVATE ${schedulerSecret} provider detail`);
    if (mode === "configuration") return { ...safeSummary, configurationBlocked: true };
    if (mode === "dead") return { ...safeSummary, sent: 0, retried: 0, dead: 1 };
    return safeSummary;
  },
};

const bundled = await bundle(
  `import * as route from './app/api/internal/scheduler/send-order-emails/route'; export { route };`,
  {
    "server-only": "",
    "@/lib/email/dispatch-order-emails": `
      export const dispatchOrderEmails = options => globalThis.__orderEmailScheduler.dispatch(options);
    `,
  },
);
const app = bundled.route;

beforeEach(() => {
  calls = 0;
  options = undefined;
  mode = "success";
  process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET = schedulerSecret;
  process.env.DEIGON_MAINTENANCE_SECRET = maintenanceSecret;
});

after(() => {
  if (originalSchedulerSecret === undefined) delete process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET;
  else process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET = originalSchedulerSecret;
  if (originalMaintenanceSecret === undefined) delete process.env.DEIGON_MAINTENANCE_SECRET;
  else process.env.DEIGON_MAINTENANCE_SECRET = originalMaintenanceSecret;
  delete globalThis.__orderEmailScheduler;
});

async function post(authorization) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  const response = await app.POST(new Request(
    "https://www.deigon.co.za/api/internal/scheduler/send-order-emails",
    { method: "POST", headers },
  ));
  return { status: response.status, body: await response.json() };
}

test("scheduler route exposes POST and no GET", () => {
  assert.equal(typeof app.POST, "function");
  assert.equal(app.GET, undefined);
});

test("missing or weak scheduler configuration returns 503 before dispatch", async () => {
  for (const value of [undefined, "", "too-short"]) {
    if (value === undefined) delete process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET;
    else process.env.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET = value;
    assert.deepEqual(await post(`Bearer ${schedulerSecret}`), {
      status: 503,
      body: { ok: false, message: "Order email scheduler is not configured." },
    });
  }
  assert.equal(calls, 0);
});

test("missing and incorrect scheduler authorization are rejected before dispatch", async () => {
  assert.deepEqual(await post(undefined), {
    status: 401,
    body: { ok: false, message: "Order email scheduler authorization required." },
  });
  assert.deepEqual(await post("Bearer wrong-secret"), {
    status: 403,
    body: { ok: false, message: "Order email scheduler authorization failed." },
  });
  assert.equal(calls, 0);
});

test("maintenance secret is rejected and scheduler secret dispatches once with limit two", async () => {
  assert.deepEqual(await post(`Bearer ${maintenanceSecret}`), {
    status: 403,
    body: { ok: false, message: "Order email scheduler authorization failed." },
  });
  assert.equal(calls, 0);

  const result = await post(`Bearer ${schedulerSecret}`);
  assert.deepEqual(result, { status: 200, body: { ok: true, summary: safeSummary } });
  assert.equal(calls, 1);
  assert.deepEqual(options, { limit: 2 });

  const serialized = JSON.stringify(result);
  for (const forbidden of [schedulerSecret, maintenanceSecret, "recipient", "orderId", "providerMessageId", "claimToken", "payload"]) {
    assert.ok(!serialized.includes(forbidden));
  }
});

test("provider configuration blockage becomes a controlled safe 503", async () => {
  mode = "configuration";
  assert.deepEqual(await post(`Bearer ${schedulerSecret}`), {
    status: 503,
    body: { ok: false, message: "Email delivery is temporarily unavailable." },
  });
  assert.equal(calls, 1);
});

test("newly dead-lettered events return a stable aggregate-only non-2xx signal", async () => {
  mode = "dead";
  const result = await post(`Bearer ${schedulerSecret}`);
  assert.deepEqual(result, {
    status: 500,
    body: {
      ok: false,
      message: "Order email delivery requires operational attention.",
      summary: { ...safeSummary, sent: 0, retried: 0, dead: 1 },
    },
  });
  assert.equal(calls, 1);
  const serialized = JSON.stringify(result);
  for (const forbidden of [schedulerSecret, maintenanceSecret, "recipient", "orderId", "providerMessageId", "claimToken", "payload"]) {
    assert.ok(!serialized.includes(forbidden));
  }
});

test("dispatcher exceptions become a generic 503 without private data", async () => {
  mode = "throw";
  const result = await post(`Bearer ${schedulerSecret}`);
  assert.deepEqual(result, {
    status: 503,
    body: { ok: false, message: "Email delivery is temporarily unavailable." },
  });
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(result).includes(schedulerSecret));
});
