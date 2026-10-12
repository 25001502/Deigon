// Disposable loopback PostgreSQL only. No deployment database, Yoco or Resend calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";
import { database } from "../admin-b1/support/database.mjs";

let handle;
let db;
let pool;
let app;
let failAdminQuery = false;
let failAdminRecipient = null;
const origin = "https://www.deigon.co.za";

before(async () => {
  handle = await database();
  ({ db, pool } = handle);
  const instrumented = db.$extends({ query: {
    user: { async findMany(event) {
      if (failAdminQuery) throw new Error("PRIVATE simulated admin lookup failure");
      return event.query(event.args);
    } },
    orderEmailOutbox: { async create(event) {
      if (event.args.data.eventType === "ADMIN_NEW_ORDER" && event.args.data.recipientEmail === failAdminRecipient) {
        throw new Error("PRIVATE simulated recipient failure");
      }
      return event.query(event.args);
    } },
  } });
  globalThis.__d2 = { client: instrumented };
  app = await bundle(`
    export { processYocoWebhook } from './lib/payments/process-yoco-webhook';
    export { dispatchOrderEmailsWithDependencies } from './lib/email/dispatch-order-emails';
    export { orderEmailProviderIdempotencyKey } from './lib/email/provider';
  `, {
    "server-only": "",
    "@/lib/prisma": "export const prisma = globalThis.__d2.client;",
  });
});

afterEach(async () => {
  failAdminQuery = false;
  failAdminRecipient = null;
  await db.orderEmailOutbox.deleteMany();
  await db.order.deleteMany({ where: { id: { notIn: ["migration-pending", "migration-confirmed"] } } });
  await db.user.deleteMany({ where: { id: { not: "migration-user" } } });
});

after(async () => {
  delete globalThis.__d2;
  await handle?.close();
});

async function admin(email, name = "DEIGON Admin", role = "ADMIN") {
  return db.user.create({ data: { id: randomUUID(), email, name, role } });
}

async function fixture({ customerEmail } = {}) {
  const id = randomUUID();
  const user = await db.user.create({ data: { id: randomUUID(), email: `${id}@example.invalid`, role: "CUSTOMER" } });
  const order = await db.order.create({ data: {
    id, orderNumber: `DGN-${id}`, idempotencyKey: `idem-${id}`,
    status: "PENDING", paymentStatus: "PENDING", fulfilmentType: "PICKUP",
    subtotal: "200.50", shippingFee: "0.00", total: "200.50",
    customerName: "Historical Customer", customerEmail: customerEmail ?? user.email, customerPhone: "+27000000000",
    pickupLocation: "Univen main gate", userId: user.id,
    items: { create: { title: "Historical item", sku: "HIST-1", size: "M", color: "Black", quantity: 2, unitPrice: "100.25", lineTotal: "200.50" } },
    payment: { create: { provider: "YOCO", amount: "200.50", status: "PENDING", providerCheckoutId: `checkout-${id}` } },
  } });
  return {
    order,
    event: { id: `evt-${id}`, type: "payment.succeeded", payload: {
      id: `txn-${id}`, type: "payment", status: "succeeded", amount: 20050,
      currency: "ZAR", metadata: { checkoutId: `checkout-${id}` },
    } },
  };
}

const rows = (id) => db.orderEmailOutbox.findMany({ where: { orderId: id }, orderBy: [{ eventType: "asc" }, { recipientKey: "asc" }] });
const dependencies = (provider, clock = () => new Date()) => ({
  database: db, provider, clock, claimToken: randomUUID, appOrigin: origin,
  createAbortSignal: () => AbortSignal.timeout(10_000),
});

test("two current admins each receive an independent snapshot beside one customer confirmation", async () => {
  const first = await admin("AdminA@Example.Invalid", "Admin A");
  const duplicate = await admin("admina@example.invalid", "Duplicate casing");
  const second = await admin("adminb@example.invalid", "Admin B");
  await admin("ordinary@example.invalid", "Ordinary", "CUSTOMER");
  const f = await fixture();
  f.event.adminRecipients = ["forged@example.invalid"];
  f.event.payload.adminRecipients = ["forged@example.invalid"];
  assert.equal(await app.processYocoWebhook(f.event), "processed");
  const events = await rows(f.order.id);
  assert.deepEqual(events.map((event) => event.eventType).sort(), ["ADMIN_NEW_ORDER", "ADMIN_NEW_ORDER", "ORDER_CONFIRMED"]);
  const admins = events.filter((event) => event.eventType === "ADMIN_NEW_ORDER");
  assert.deepEqual(admins.map((event) => event.recipientEmail).sort(), ["admina@example.invalid", "adminb@example.invalid"]);
  assert.deepEqual(admins.map((event) => event.recipientKey).sort(), ["admina@example.invalid", "adminb@example.invalid"]);
  assert.equal(admins[0].payload.recipient.recipientEmail, admins[0].recipientEmail);
  assert.equal(admins[1].payload.recipient.recipientEmail, admins[1].recipientEmail);
  assert.equal(admins[0].payload.customer.email, (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).customerEmail);
  assert.equal(admins[0].payload.customer.phone, "+27000000000");
  assert.equal(Object.hasOwn(admins[0].payload, "destination"), false);
  assert.equal(Object.hasOwn(admins[0].payload, "payment"), false);
  assert.equal(events.some((event) => event.recipientEmail === "ordinary@example.invalid"), false);
  assert.equal(events.some((event) => event.recipientEmail === "forged@example.invalid"), false);
  assert.equal(events.every((event) => event.status === "PENDING"), true);
  assert.equal(new Set(events.map((event) => event.id)).size, 3);
  assert.equal(new Set(events.map((event) => app.orderEmailProviderIdempotencyKey(event.id))).size, 3);
  assert.equal(events.find((event) => event.eventType === "ORDER_CONFIRMED").recipientKey, "customer");

  await db.user.update({ where: { id: first.id }, data: { email: "changed-a@example.invalid", role: "CUSTOMER" } });
  await db.user.update({ where: { id: duplicate.id }, data: { role: "CUSTOMER" } });
  await db.user.update({ where: { id: second.id }, data: { name: "Changed B" } });
  assert.deepEqual((await rows(f.order.id)).filter((event) => event.eventType === "ADMIN_NEW_ORDER"), admins);
  assert.equal(await app.processYocoWebhook(f.event), "duplicate");
  assert.equal((await rows(f.order.id)).length, 3);

  const next = await fixture();
  assert.equal(await app.processYocoWebhook(next.event), "processed");
  assert.deepEqual((await rows(next.order.id)).filter((event) => event.eventType === "ADMIN_NEW_ORDER").map((event) => event.recipientEmail), ["adminb@example.invalid"]);
});

test("zero admins and a failed admin lookup cannot roll back paid order or customer confirmation", async () => {
  for (const failedLookup of [false, true]) {
    failAdminQuery = failedLookup;
    const f = await fixture();
    assert.equal(await app.processYocoWebhook(f.event), "processed");
    const order = await db.order.findUniqueOrThrow({ where: { id: f.order.id }, include: { payment: true } });
    assert.equal(order.status, "CONFIRMED");
    assert.equal(order.paymentStatus, "PAID");
    assert.equal(order.payment.status, "PAID");
    assert.deepEqual((await rows(f.order.id)).map((event) => event.eventType), ["ORDER_CONFIRMED"]);
  }
});

test("one admin recipient failure leaves another admin and customer event durable", async () => {
  await admin("a@example.invalid", "Admin A");
  await admin("b@example.invalid", "Admin B");
  failAdminRecipient = "a@example.invalid";
  const f = await fixture();
  assert.equal(await app.processYocoWebhook(f.event), "processed");
  assert.deepEqual((await rows(f.order.id)).map((event) => event.recipientEmail).sort(), ["b@example.invalid", (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).customerEmail].sort());
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: f.order.id }, include: { payment: true } })).payment.status, "PAID");
});

test("customer confirmation retry and Admin A retry do not block Admin B", async () => {
  await admin("a@example.invalid", "Admin A");
  await admin("b@example.invalid", "Admin B");
  const f = await fixture();
  await app.processYocoWebhook(f.event);
  const sent = [];
  const provider = { async send(input) {
    sent.push(input);
    if (input.to === "b@example.invalid") return { ok: true, providerMessageId: `msg-${sent.length}` };
    return { ok: false, kind: "RETRYABLE", code: "network_error", statusCode: null, retryAfterSeconds: null };
  } };
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 3 });
  assert.equal(summary.examined, 3);
  assert.equal(summary.sent, 1);
  assert.equal(summary.retried, 2);
  assert.equal((await rows(f.order.id)).find((event) => event.recipientEmail === "b@example.invalid").status, "SENT");
  assert.equal(sent.length, 3);
  assert.equal(new Set(sent.map((input) => input.to)).size, 3);
});

test("admin recipient mismatch is DEAD without a provider request", async () => {
  await admin("a@example.invalid", "Admin A");
  const f = await fixture();
  await app.processYocoWebhook(f.event);
  const adminEvent = (await rows(f.order.id)).find((event) => event.eventType === "ADMIN_NEW_ORDER");
  await db.orderEmailOutbox.update({ where: { id: adminEvent.id }, data: {
    payload: { ...adminEvent.payload, recipient: { recipientEmail: "other@example.invalid", recipientName: "Admin A" } },
  } });
  const calls = [];
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies({ async send(input) {
    calls.push(input);
    return { ok: true, providerMessageId: "should-not-send" };
  } }), { limit: 2 });
  assert.equal(summary.dead, 1);
  assert.equal(calls.some((input) => input.to === "a@example.invalid"), false);
  assert.equal((await db.orderEmailOutbox.findUniqueOrThrow({ where: { id: adminEvent.id } })).lastErrorCode, "recipient_snapshot_mismatch");
});

test("a DEAD admin recipient does not block another admin recipient", async () => {
  await admin("a@example.invalid", "Admin A");
  await admin("b@example.invalid", "Admin B");
  const f = await fixture();
  await app.processYocoWebhook(f.event);
  const events = await rows(f.order.id);
  const adminA = events.find((event) => event.recipientEmail === "a@example.invalid");
  await db.orderEmailOutbox.update({ where: { id: adminA.id }, data: {
    payload: { ...adminA.payload, recipient: { recipientEmail: "other@example.invalid", recipientName: "Admin A" } },
  } });
  const sent = [];
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies({ async send(input) {
    sent.push(input.to);
    return { ok: true, providerMessageId: `message-${sent.length}` };
  } }), { limit: 3 });
  assert.equal(summary.dead, 1);
  assert.equal(summary.sent, 2);
  assert.equal(sent.includes("a@example.invalid"), false);
  assert.equal(sent.includes("b@example.invalid"), true);
  assert.equal((await db.orderEmailOutbox.findUniqueOrThrow({ where: { id: adminA.id } })).status, "DEAD");
  assert.equal((await rows(f.order.id)).find((event) => event.recipientEmail === "b@example.invalid").status, "SENT");
});

test("admin retry persists immutable rendered content and reuses its row idempotency key", async () => {
  await admin("a@example.invalid", "Admin A");
  const f = await fixture();
  await app.processYocoWebhook(f.event);
  const events = await rows(f.order.id);
  const customer = events.find((event) => event.eventType === "ORDER_CONFIRMED");
  const adminEvent = events.find((event) => event.eventType === "ADMIN_NEW_ORDER");
  await db.orderEmailOutbox.update({ where: { id: customer.id }, data: { status: "DEAD" } });

  const firstCalls = [];
  const failure = { async send(input) {
    firstCalls.push(input);
    return { ok: false, kind: "RETRYABLE", code: "network_error", statusCode: null, retryAfterSeconds: null };
  } };
  const first = await app.dispatchOrderEmailsWithDependencies(dependencies(failure), { limit: 1 });
  assert.equal(first.retried, 1);
  const stored = await db.orderEmailOutbox.findUniqueOrThrow({ where: { id: adminEvent.id } });
  assert.ok(stored.renderedSubject?.includes(f.order.orderNumber));
  assert.ok(stored.renderedHtml?.includes(`/admin/orders/${f.order.id}`));
  assert.ok(stored.renderedText?.includes("Historical Customer"));
  assert.equal(stored.renderedHtml?.includes("Univen main gate"), false);
  assert.equal(stored.renderedHtml?.includes("txn-"), false);

  await db.order.update({ where: { id: f.order.id }, data: { customerName: "Changed live name" } });
  const secondCalls = [];
  const later = new Date(stored.nextAttemptAt.getTime() + 1000);
  const sent = await app.dispatchOrderEmailsWithDependencies(dependencies({ async send(input) {
    secondCalls.push(input);
    const committed = await pool.query('SELECT status FROM "Payment" WHERE "orderId"=$1', [f.order.id]);
    assert.equal(committed.rows[0].status, "PAID");
    return { ok: true, providerMessageId: "d2-provider-message" };
  } }, () => later), { limit: 1 });
  assert.equal(sent.sent, 1);
  assert.deepEqual(secondCalls, firstCalls);
  assert.equal(secondCalls[0].to, "a@example.invalid");
  assert.equal(secondCalls[0].idempotencyKey, app.orderEmailProviderIdempotencyKey(adminEvent.id));
});

test("an admin retry does not block a later customer lifecycle event", async () => {
  await admin("a@example.invalid", "Admin A");
  const f = await fixture();
  await app.processYocoWebhook(f.event);
  const events = await rows(f.order.id);
  const customer = events.find((event) => event.eventType === "ORDER_CONFIRMED");
  await db.orderEmailOutbox.update({ where: { id: customer.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: `confirmed-${f.order.id}` } });
  const processingAt = new Date();
  await db.order.update({ where: { id: f.order.id }, data: { status: "PROCESSING", processingAt } });
  await db.orderEmailOutbox.create({ data: {
    orderId: f.order.id,
    eventType: "ORDER_PROCESSING",
    recipientEmail: customer.recipientEmail,
    recipientName: customer.recipientName,
    templateVersion: 1,
    payload: { ...customer.payload, processingAt: processingAt.toISOString() },
  } });
  const sent = [];
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies({ async send(input) {
    sent.push(input.to);
    return input.to === "a@example.invalid"
      ? { ok: false, kind: "RETRYABLE", code: "network_error", statusCode: null, retryAfterSeconds: null }
      : { ok: true, providerMessageId: `processing-${f.order.id}` };
  } }), { limit: 2 });
  assert.equal(summary.retried, 1);
  assert.equal(summary.sent, 1);
  assert.deepEqual(sent.sort(), ["a@example.invalid", customer.recipientEmail].sort());
});

test("invalid admin address is skipped without changing the payment or other recipients", async () => {
  await admin("bad-address", "Bad Admin");
  await admin("good@example.invalid", "Good Admin");
  const f = await fixture();
  assert.equal(await app.processYocoWebhook(f.event), "processed");
  assert.deepEqual((await rows(f.order.id)).map((event) => event.recipientEmail).sort(), [
    "good@example.invalid", (await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).customerEmail,
  ].sort());
});

test("malformed historical customer email does not block the valid admin notification", async () => {
  await admin("valid-admin@example.invalid", "Valid Admin");
  const f = await fixture({ customerEmail: "bad-address" });

  assert.equal(await app.processYocoWebhook(f.event), "processed");
  const order = await db.order.findUniqueOrThrow({ where: { id: f.order.id }, include: { payment: true } });
  assert.equal(order.status, "CONFIRMED");
  assert.equal(order.paymentStatus, "PAID");
  assert.equal(order.payment.status, "PAID");

  const enqueued = await rows(f.order.id);
  const adminEvent = enqueued.find((event) => event.eventType === "ADMIN_NEW_ORDER");
  const customerEvent = enqueued.find((event) => event.eventType === "ORDER_CONFIRMED");
  assert.ok(adminEvent);
  assert.ok(customerEvent);
  assert.equal(adminEvent.recipientEmail, "valid-admin@example.invalid");
  assert.equal(adminEvent.payload.customer.email, "bad-address");

  const calls = [];
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies({ async send(input) {
    calls.push(input);
    return { ok: true, providerMessageId: "admin-message" };
  } }), { limit: 2 });
  assert.equal(summary.sent, 1);
  assert.equal(summary.dead, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, "valid-admin@example.invalid");
  assert.ok(calls[0].html.includes("bad-address"));
  assert.ok(calls[0].text.includes("bad-address"));

  const dispatched = await rows(f.order.id);
  const dispatchedAdmin = dispatched.find((event) => event.id === adminEvent.id);
  const dispatchedCustomer = dispatched.find((event) => event.id === customerEvent.id);
  assert.equal(dispatchedAdmin.status, "SENT");
  assert.notEqual(dispatchedAdmin.lastErrorCode, "invalid_email_payload");
  assert.equal(dispatchedCustomer.status, "DEAD");
  assert.equal(dispatchedCustomer.lastErrorCode, "invalid_recipient");
});
