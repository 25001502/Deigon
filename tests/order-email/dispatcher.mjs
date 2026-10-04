// Fresh loopback PostgreSQL only. Never reads a deployment database URL or contacts Resend.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, test } from "node:test";

import { bundle } from "../admin-a/support/bundle.mjs";
import { database } from "../admin-b1/support/database.mjs";

const now = new Date("2026-10-03T08:00:00.000Z");
const minute = 60 * 1000;
let handle;
let db;
let pool;
let app;

before(async () => {
  handle = await database();
  ({ db, pool } = handle);
  app = await bundle(`
    export * from './lib/email/dispatch-order-emails';
    export * from './lib/email/order-email-retry';
  `, {
    "server-only": "",
    "@/lib/prisma": "export const prisma = null;",
  });
});

after(async () => { await handle?.close(); });

afterEach(async () => {
  await db.orderEmailOutbox.deleteMany();
  await db.order.deleteMany({ where: { id: { notIn: ["migration-pending", "migration-confirmed"] } } });
  await db.user.deleteMany({ where: { id: { not: "migration-user" } } });
});

function snapshot(
  orderId,
  email = "customer@example.invalid",
  name = "Historical Customer",
  milestones = {},
) {
  return {
    version: 1,
    orderId,
    orderNumber: `DGN-${orderId}`,
    customer: { name, email },
    fulfilmentType: "PICKUP",
    items: [{
      title: "Historical item", sku: `SKU-${orderId}`, size: "M", color: "Black",
      imageUrl: "/historical.jpg", quantity: 2, unitPrice: "100.25", lineTotal: "200.50",
    }],
    subtotal: "200.50", shippingFee: "0.00", total: "200.50",
    destination: { type: "PICKUP", pickupLocation: "DEIGON Studio" },
    createdAt: "2026-10-03T07:00:00.000Z", confirmedAt: "2026-10-03T07:01:00.000Z",
    processingAt: null, shippedAt: null, readyForPickupAt: null, deliveredAt: null,
    estimatedDeliveryDate: null,
    ...milestones,
  };
}

async function fixture(overrides = {}) {
  const id = overrides.orderId ?? randomUUID();
  const email = overrides.orderEmail ?? `${id}@example.invalid`;
  await db.user.create({ data: { id, email } });
  const order = await db.order.create({ data: {
    id,
    orderNumber: `DGN-${id}`,
    idempotencyKey: `idem-${id}`,
    status: "CONFIRMED",
    paymentStatus: "PAID",
    fulfilmentType: "PICKUP",
    subtotal: "200.50",
    shippingFee: "0.00",
    total: "200.50",
    customerName: "Historical Customer",
    customerEmail: email,
    pickupLocation: "DEIGON Studio",
    confirmedAt: new Date("2026-10-03T07:01:00.000Z"),
    userId: id,
    items: { create: {
      quantity: 2, unitPrice: "100.25", lineTotal: "200.50",
      title: "Historical item", sku: `SKU-${id}`, size: "M", color: "Black",
    } },
    payment: { create: {
      amount: "200.50", status: "PAID", provider: "YOCO", transactionId: `txn-${id}`,
    } },
  }, include: { payment: true, items: true } });
  const recipientEmail = overrides.recipientEmail ?? email;
  const recipientName = overrides.recipientName ?? "Historical Customer";
  const event = await db.orderEmailOutbox.create({ data: {
    id: overrides.outboxId ?? randomUUID(),
    orderId: id,
    eventType: overrides.eventType ?? "ORDER_CONFIRMED",
    status: overrides.status ?? "PENDING",
    recipientEmail,
    recipientName,
    templateVersion: overrides.templateVersion ?? 1,
    payload: overrides.payload ?? snapshot(id, overrides.payloadEmail ?? recipientEmail, overrides.payloadName ?? recipientName),
    renderedSubject: overrides.renderedSubject ?? null,
    renderedHtml: overrides.renderedHtml ?? null,
    renderedText: overrides.renderedText ?? null,
    attemptCount: overrides.attemptCount ?? 0,
    nextAttemptAt: overrides.nextAttemptAt ?? now,
    claimedAt: overrides.claimedAt ?? null,
    claimToken: overrides.claimToken ?? null,
    lastAttemptAt: overrides.lastAttemptAt ?? null,
    createdAt: overrides.createdAt ?? now,
  } });
  return { order, event };
}

async function additionalEvent(order, overrides = {}) {
  const eventType = overrides.eventType ?? "ORDER_PROCESSING";
  const recipientEmail = overrides.recipientEmail ?? order.customerEmail;
  const recipientName = overrides.recipientName ?? order.customerName;
  const payload = overrides.payload ?? snapshot(order.id, recipientEmail, recipientName, {
    processingAt: "2026-10-03T07:30:00.000Z",
  });
  return db.orderEmailOutbox.create({ data: {
    id: overrides.outboxId ?? randomUUID(),
    orderId: order.id,
    eventType,
    status: overrides.status ?? "PENDING",
    recipientEmail,
    recipientName,
    templateVersion: overrides.templateVersion ?? 1,
    payload,
    attemptCount: overrides.attemptCount ?? 0,
    nextAttemptAt: overrides.nextAttemptAt ?? now,
    claimedAt: overrides.claimedAt ?? null,
    claimToken: overrides.claimToken ?? null,
    lastAttemptAt: overrides.lastAttemptAt ?? null,
    createdAt: overrides.createdAt ?? new Date(now.getTime() + 1_000),
  } });
}

function successProvider(calls, providerMessageId = "resend-message") {
  return { async send(input) { calls.push(input); return { ok: true, providerMessageId }; } };
}

function dependencies(provider, options = {}) {
  let token = 0;
  return {
    database: options.database ?? db,
    provider,
    clock: options.clock ?? (() => now),
    claimToken: options.claimToken ?? (() => `claim-${++token}-${randomUUID()}`),
    appOrigin: options.appOrigin ?? "https://www.deigon.co.za",
    createAbortSignal: options.createAbortSignal ?? (() => AbortSignal.timeout(10_000)),
  };
}

function barrier(target = 1) {
  let enteredCount = 0;
  let release;
  let enteredResolve;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  const released = new Promise((resolve) => { release = resolve; });
  return {
    entered,
    release,
    async wait() {
      enteredCount += 1;
      if (enteredCount === target) enteredResolve();
      await released;
    },
  };
}

async function row(id) {
  return db.orderEmailOutbox.findUniqueOrThrow({ where: { id } });
}

async function commerceState(orderId) {
  return db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, payment: true } });
}

test("two genuinely overlapping workers call the provider once for one pending event", async () => {
  const { event } = await fixture();
  const gate = barrier();
  const calls = [];
  const provider = { async send(input) { calls.push(input); await gate.wait(); return { ok: true, providerMessageId: "single-worker" }; } };
  const workerA = app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 1 });
  await gate.entered;
  const workerB = await app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 1 });
  assert.equal(workerB.examined, 0);
  assert.equal(calls.length, 1);
  gate.release();
  assert.equal((await workerA).sent, 1);
  assert.equal((await row(event.id)).status, "SENT");
});

test("multiple overlapping workers claim distinct rows and each active claim is unique", async () => {
  const first = await fixture({ createdAt: new Date(now.getTime() - 2_000) });
  const second = await fixture({ createdAt: new Date(now.getTime() - 1_000) });
  const gate = barrier(2);
  const calls = [];
  const provider = { async send(input) {
    calls.push(input);
    const providerMessageId = `multi-${calls.length}`;
    await gate.wait();
    return { ok: true, providerMessageId };
  } };
  const workerA = app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 1 });
  const workerB = app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 1 });
  await gate.entered;
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].idempotencyKey, calls[1].idempotencyKey);
  gate.release();
  const summaries = await Promise.all([workerA, workerB]);
  assert.equal(summaries.reduce((sum, value) => sum + value.sent, 0), 2);
  assert.deepEqual((await Promise.all([row(first.event.id), row(second.event.id)])).map((value) => value.status), ["SENT", "SENT"]);
});

test("confirmation retry backoff blocks due processing until confirmation is SENT", async () => {
  const first = await fixture({ nextAttemptAt: new Date(now.getTime() + minute) });
  const processing = await additionalEvent(first.order);
  const calls = [];
  const provider = successProvider(calls, "processing-after-confirmation");

  const blocked = await app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 1 });
  assert.equal(blocked.examined, 0);
  assert.equal(calls.length, 0);
  assert.equal((await row(processing.id)).status, "PENDING");

  await db.orderEmailOutbox.update({
    where: { id: first.event.id },
    data: { status: "SENT", sentAt: now, providerMessageId: "confirmation-sent" },
  });
  const resumed = await app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 1 });
  assert.equal(resumed.sent, 1);
  assert.equal(calls.length, 1);
  assert.equal((await row(processing.id)).status, "SENT");
});

test("a DEAD earlier lifecycle event does not permanently block a later event", async () => {
  const first = await fixture({ status: "DEAD", attemptCount: 8 });
  const processing = await additionalEvent(first.order);
  const calls = [];
  const summary = await app.dispatchOrderEmailsWithDependencies(
    dependencies(successProvider(calls, "processing-after-dead")),
    { limit: 1 },
  );
  assert.equal(summary.sent, 1);
  assert.equal(calls.length, 1);
  assert.equal((await row(processing.id)).status, "SENT");
});

test("stale earlier SENDING blocks a later event until recovery finalizes it", async () => {
  const staleAt = new Date(now.getTime() - 11 * minute);
  const first = await fixture({
    status: "SENDING",
    attemptCount: 1,
    claimedAt: staleAt,
    claimToken: "stale-earlier-claim",
  });
  const processing = await additionalEvent(first.order);
  const gate = barrier();
  const earlierCalls = [];
  const recoveringProvider = { async send(input) {
    earlierCalls.push(input);
    await gate.wait();
    return { ok: true, providerMessageId: "recovered-earlier" };
  } };
  const recovery = app.dispatchOrderEmailsWithDependencies(
    dependencies(recoveringProvider),
    { limit: 1 },
  );
  await gate.entered;

  const blocked = await app.dispatchOrderEmailsWithDependencies(
    dependencies(successProvider([], "must-not-send")),
    { limit: 1 },
  );
  assert.equal(blocked.examined, 0);
  assert.equal((await row(processing.id)).status, "PENDING");

  gate.release();
  assert.equal((await recovery).sent, 1);
  const laterCalls = [];
  const resumed = await app.dispatchOrderEmailsWithDependencies(
    dependencies(successProvider(laterCalls, "processing-after-recovery")),
    { limit: 1 },
  );
  assert.equal(resumed.sent, 1);
  assert.equal(earlierCalls.length, 1);
  assert.equal(laterCalls.length, 1);
});

test("provider call observes a committed SENDING claim from a second database connection", async () => {
  const { event } = await fixture();
  const seen = [];
  const provider = { async send() {
    seen.push((await pool.query('SELECT status,"claimToken" FROM "OrderEmailOutbox" WHERE id=$1', [event.id])).rows[0]);
    return { ok: true, providerMessageId: "outside-transaction" };
  } };
  await app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 1 });
  assert.equal(seen[0].status, "SENDING");
  assert.match(seen[0].claimToken, /^claim-/);
});

test("losing the active claim before rendered content is persisted prevents provider work", async () => {
  const { event } = await fixture();
  let transactions = 0;
  const lostClaimDatabase = new Proxy(db, {
    get(target, property) {
      if (property === "$transaction") return async (...args) => {
        transactions += 1;
        if (transactions === 2) return { count: 0 };
        return target.$transaction(...args);
      };
      const member = target[property];
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
  const calls = [];
  const summary = await app.dispatchOrderEmailsWithDependencies(
    dependencies(successProvider(calls), { database: lostClaimDatabase }),
    { limit: 1 },
  );
  const stored = await row(event.id);
  assert.equal(summary.lostClaims, 1);
  assert.equal(calls.length, 0);
  assert.equal(stored.status, "SENDING");
  assert.equal(stored.renderedSubject, null);
  assert.equal(stored.renderedHtml, null);
  assert.equal(stored.renderedText, null);
});

test("success finalizes SENT and leaves Order and Payment unchanged", async () => {
  const fixtureValue = await fixture();
  const before = JSON.parse(JSON.stringify(await commerceState(fixtureValue.order.id)));
  const calls = [];
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies(successProvider(calls, "success-message")), { limit: 1 });
  const event = await row(fixtureValue.event.id);
  assert.deepEqual(summary, { examined: 1, sent: 1, retried: 0, dead: 0, staleRecovered: 0, lostClaims: 0, configurationBlocked: false });
  assert.equal(event.status, "SENT");
  assert.equal(event.attemptCount, 1);
  assert.ok(event.sentAt);
  assert.equal(event.providerMessageId, "success-message");
  assert.equal(event.claimedAt, null);
  assert.equal(event.claimToken, null);
  assert.equal(event.lastErrorCode, null);
  assert.deepEqual(JSON.parse(JSON.stringify(await commerceState(fixtureValue.order.id))), before);
  assert.equal(calls[0].idempotencyKey, `deigon/order-email/v1/${event.id}`);
});

test("invalid recipients, corrupt snapshots, unsupported versions, impossible events and mismatches die without provider calls", async (t) => {
  const cases = [
    { name: "invalid recipient", overrides: { recipientEmail: "not-an-email" }, code: "invalid_recipient" },
    { name: "malformed payload", overrides: { payload: { private: "payload must not escape" } }, code: "invalid_email_payload" },
    { name: "unsupported version", overrides: { templateVersion: 2 }, code: "unsupported_template_version" },
    { name: "recipient mismatch", overrides: { payloadEmail: "different@example.invalid" }, code: "recipient_snapshot_mismatch" },
    { name: "impossible event", overrides: { eventType: "ORDER_SHIPPED" }, code: "invalid_email_event" },
  ];
  for (const item of cases) await t.test(item.name, async () => {
    const value = await fixture(item.overrides);
    const before = JSON.parse(JSON.stringify(await commerceState(value.order.id)));
    const calls = [];
    const summary = await app.dispatchOrderEmailsWithDependencies(dependencies(successProvider(calls)), { limit: 1 });
    const event = await row(value.event.id);
    assert.equal(summary.dead, 1);
    assert.equal(calls.length, 0);
    assert.equal(event.status, "DEAD");
    assert.equal(event.lastErrorCode, item.code);
    assert.equal(event.lastError, "Order email data is invalid.");
    assert.deepEqual(JSON.parse(JSON.stringify(await commerceState(value.order.id))), before);
    assert.ok(!JSON.stringify(summary).includes(value.event.recipientEmail));
  });
});

test("retryable outcomes follow the exact attempts 1 through 8 schedule", async () => {
  const delays = [1, 5, 15, 60, 180, 360, 720].map((minutes) => minutes * minute);
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const value = await fixture({ attemptCount: attempt - 1 });
    const provider = { async send() { return { ok: false, kind: "RETRYABLE", code: "rate_limit_exceeded", statusCode: 429, retryAfterSeconds: null }; } };
    const summary = await app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 1 });
    const event = await row(value.event.id);
    assert.equal(event.attemptCount, attempt);
    if (attempt < 8) {
      assert.equal(summary.retried, 1);
      assert.equal(event.status, "PENDING");
      assert.equal(event.nextAttemptAt.getTime(), now.getTime() + delays[attempt - 1]);
    } else {
      assert.equal(summary.dead, 1);
      assert.equal(event.status, "DEAD");
      assert.equal(event.lastErrorCode, "retry_attempts_exhausted");
    }
  }
});

test("Retry-After can extend but never shorten normal backoff", async () => {
  for (const [retryAfterSeconds, expectedSeconds] of [[300, 300], [30, 60]]) {
    const value = await fixture();
    const provider = { async send() { return { ok: false, kind: "RETRYABLE", code: "rate_limit_exceeded", statusCode: 429, retryAfterSeconds }; } };
    await app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 1 });
    assert.equal((await row(value.event.id)).nextAttemptAt.getTime(), now.getTime() + expectedSeconds * 1000);
  }
});

test("configuration failure restores the attempt budget, delays one hour and stops the run", async () => {
  const first = await fixture({ createdAt: new Date(now.getTime() - 2_000), attemptCount: 3 });
  const second = await fixture({ createdAt: new Date(now.getTime() - 1_000) });
  let calls = 0;
  const provider = { async send() { calls += 1; return { ok: false, kind: "CONFIGURATION", code: "invalid_api_key", statusCode: 401, retryAfterSeconds: null }; } };
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies(provider));
  const [firstRow, secondRow] = await Promise.all([row(first.event.id), row(second.event.id)]);
  assert.equal(calls, 1);
  assert.deepEqual(summary, { examined: 1, sent: 0, retried: 1, dead: 0, staleRecovered: 0, lostClaims: 0, configurationBlocked: true });
  assert.equal(firstRow.status, "PENDING");
  assert.equal(firstRow.attemptCount, 3);
  assert.equal(firstRow.nextAttemptAt.getTime(), now.getTime() + 60 * minute);
  assert.equal(firstRow.claimToken, null);
  assert.equal(secondRow.status, "PENDING");
  assert.equal(secondRow.attemptCount, 0);
});

test("permanent failure kills one event and continues to a later event", async () => {
  const first = await fixture({ createdAt: new Date(now.getTime() - 2_000) });
  const second = await fixture({ createdAt: new Date(now.getTime() - 1_000) });
  let calls = 0;
  const provider = { async send() {
    calls += 1;
    return calls === 1
      ? { ok: false, kind: "PERMANENT", code: "validation_error", statusCode: 422, retryAfterSeconds: null }
      : { ok: true, providerMessageId: "after-permanent" };
  } };
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies(provider));
  assert.equal(summary.dead, 1);
  assert.equal(summary.sent, 1);
  assert.equal((await row(first.event.id)).status, "DEAD");
  assert.equal((await row(second.event.id)).status, "SENT");
});

test("idempotency conflict becomes DEAD with its stable operational code", async () => {
  const value = await fixture();
  const provider = { async send() { return { ok: false, kind: "IDEMPOTENCY_CONFLICT", code: "invalid_idempotent_request", statusCode: 409, retryAfterSeconds: null }; } };
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies(provider), { limit: 1 });
  const event = await row(value.event.id);
  assert.equal(summary.dead, 1);
  assert.equal(event.status, "DEAD");
  assert.equal(event.lastErrorCode, "provider_idempotency_conflict");
});

test("stale SENDING is reclaimed and a stale row at max attempts is dead-lettered without sending", async () => {
  const staleAt = new Date(now.getTime() - 11 * minute);
  const recoverable = await fixture({ status: "SENDING", attemptCount: 2, claimedAt: staleAt, claimToken: "old-claim" });
  const calls = [];
  const recovered = await app.dispatchOrderEmailsWithDependencies(dependencies(successProvider(calls, "stale-success")), { limit: 1 });
  assert.equal(recovered.staleRecovered, 1);
  assert.equal(recovered.sent, 1);
  assert.equal((await row(recoverable.event.id)).attemptCount, 3);

  const exhausted = await fixture({ status: "SENDING", attemptCount: 8, claimedAt: staleAt, claimToken: "max-claim" });
  const noSend = [];
  const dead = await app.dispatchOrderEmailsWithDependencies(dependencies(successProvider(noSend)), { limit: 1 });
  const exhaustedRow = await row(exhausted.event.id);
  assert.equal(noSend.length, 0);
  assert.equal(dead.staleRecovered, 1);
  assert.equal(dead.dead, 1);
  assert.equal(exhaustedRow.status, "DEAD");
  assert.equal(exhaustedRow.lastErrorCode, "stale_claim_after_max_attempts");
  assert.equal(exhaustedRow.claimToken, null);
});

test("a newer claim wins and the old worker records a lost claim without overwriting it", async () => {
  const value = await fixture();
  const gate = barrier();
  const providerA = { async send() { await gate.wait(); return { ok: true, providerMessageId: "old-worker" }; } };
  const providerB = { async send() { return { ok: true, providerMessageId: "new-worker" }; } };
  const workerA = app.dispatchOrderEmailsWithDependencies(dependencies(providerA, { clock: () => now, claimToken: () => "worker-a" }), { limit: 1 });
  await gate.entered;
  const later = new Date(now.getTime() + 11 * minute);
  const workerB = await app.dispatchOrderEmailsWithDependencies(dependencies(providerB, { clock: () => later, claimToken: () => "worker-b" }), { limit: 1 });
  assert.equal(workerB.sent, 1);
  gate.release();
  const oldSummary = await workerA;
  assert.equal(oldSummary.lostClaims, 1);
  const final = await row(value.event.id);
  assert.equal(final.status, "SENT");
  assert.equal(final.providerMessageId, "new-worker");
  assert.equal(final.attemptCount, 2);
});

test("crash after provider acceptance recovers with identical deterministic provider input", async () => {
  const value = await fixture();
  const firstCalls = [];
  let transactions = 0;
  const crashingDatabase = new Proxy(db, {
    get(target, property) {
      if (property === "$transaction") return async (...args) => {
        transactions += 1;
        if (transactions === 3) throw new Error("TEST simulated process death before finalization");
        return target.$transaction(...args);
      };
      const member = target[property];
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
  await assert.rejects(
    app.dispatchOrderEmailsWithDependencies(dependencies(
      successProvider(firstCalls, "accepted-before-crash"),
      { database: crashingDatabase, appOrigin: "https://origin-a.example" },
    ), { limit: 1 }),
    /simulated process death/,
  );
  const stranded = await row(value.event.id);
  assert.equal(stranded.status, "SENDING");
  assert.equal(typeof stranded.renderedSubject, "string");
  assert.equal(typeof stranded.renderedHtml, "string");
  assert.equal(typeof stranded.renderedText, "string");
  const secondCalls = [];
  const later = new Date(now.getTime() + 11 * minute);
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies(
    successProvider(secondCalls, "accepted-after-recovery"),
    { clock: () => later, appOrigin: "https://origin-b.example" },
  ), { limit: 1 });
  assert.equal(summary.staleRecovered, 1);
  assert.equal(summary.sent, 1);
  for (const field of ["to", "subject", "html", "text", "idempotencyKey"]) {
    assert.equal(secondCalls[0][field], firstCalls[0][field], field);
  }
  assert.match(firstCalls[0].html, /https:\/\/origin-a\.example/);
  assert.doesNotMatch(secondCalls[0].html, /https:\/\/origin-b\.example/);
  assert.equal((await row(value.event.id)).status, "SENT");
});

test("trusted origin and dispatch limits fail before a database claim", async () => {
  const value = await fixture();
  const calls = [];
  await assert.rejects(
    app.dispatchOrderEmailsWithDependencies(dependencies(successProvider(calls), { appOrigin: "http://not-trusted.example" }), { limit: 1 }),
    /origin is invalid/,
  );
  await assert.rejects(
    app.dispatchOrderEmailsWithDependencies(dependencies(successProvider(calls)), { limit: 11 }),
    /limit is invalid/,
  );
  assert.equal(calls.length, 0);
  assert.equal((await row(value.event.id)).attemptCount, 0);
});

test("dispatcher summary is aggregate-only and excludes private identifiers", async () => {
  const value = await fixture();
  const summary = await app.dispatchOrderEmailsWithDependencies(dependencies(successProvider([], "summary-provider-id")), { limit: 1 });
  assert.deepEqual(Object.keys(summary).sort(), ["configurationBlocked", "dead", "examined", "lostClaims", "retried", "sent", "staleRecovered"]);
  const serialized = JSON.stringify(summary);
  for (const forbidden of [value.order.id, value.event.id, value.event.recipientEmail, "summary-provider-id", "claim-"]) {
    assert.ok(!serialized.includes(forbidden));
  }
});
