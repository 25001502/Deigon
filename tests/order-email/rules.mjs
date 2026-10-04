import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { root } from "../admin-a/support/bundle.mjs";

const source = (file) => readFileSync(`${root}/${file}`, "utf8");
const filesUnder = (directory) => readdirSync(`${root}/${directory}`, {
  recursive: true,
  withFileTypes: true,
}).filter((entry) => entry.isFile()).map((entry) =>
  `${directory}/${entry.parentPath.slice(`${root}/${directory}`.length + 1).replaceAll("\\", "/")}/${entry.name}`
    .replace(`/${entry.name}/${entry.name}`, `/${entry.name}`)
    .replaceAll("//", "/")
);
const migrationPath = "prisma/migrations/20261002000000_order_email_outbox/migration.sql";
const migration = source(migrationPath);

test("B1 schema defines the approved event, status and outbox contract", () => {
  const schema = source("prisma/schema.prisma");
  for (const value of ["ORDER_CONFIRMED", "ORDER_PROCESSING", "ORDER_SHIPPED", "ORDER_READY_FOR_PICKUP", "ORDER_COMPLETED"]) {
    assert.match(schema, new RegExp(`\\b${value}\\b`));
  }
  for (const value of ["PENDING", "SENDING", "SENT", "DEAD"]) assert.match(schema, new RegExp(`\\b${value}\\b`));
  assert.match(schema, /model OrderEmailOutbox \{/);
  assert.match(schema, /order\s+Order\s+@relation\(fields: \[orderId\], references: \[id\], onDelete: Restrict\)/);
  assert.match(schema, /@@unique\(\[orderId, eventType\]\)/);
  assert.match(schema, /@@index\(\[status, nextAttemptAt, createdAt\]\)/);
  assert.match(schema, /@@index\(\[status, claimedAt\]\)/);
  assert.match(schema, /providerMessageId\s+String\?\s+@unique/);
  for (const field of ["renderedSubject", "renderedHtml", "renderedText"]) {
    assert.match(schema, new RegExp(`${field}\\s+String\\?\\s+@db\\.Text`));
  }
  assert.match(schema, /emailOutboxEvents\s+OrderEmailOutbox\[\]/);
});

test("B1 migration is additive, transaction-wrapped and has no historical backfill", () => {
  const executable = migration.replace(/^\s*--.*$/gm, "").trim();
  assert.match(executable, /^BEGIN;\s*CREATE TYPE "OrderEmailEventType"/);
  assert.match(executable, /ON DELETE RESTRICT ON UPDATE CASCADE;\s*COMMIT;$/);
  assert.equal((executable.match(/\bBEGIN;/g) ?? []).length, 1);
  assert.equal((executable.match(/\bCOMMIT;/g) ?? []).length, 1);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/im);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+"OrderEmailOutbox"/i);
  assert.doesNotMatch(migration, /ALTER\s+TABLE\s+"(?:Order|OrderItem|Payment|Inventory|ProductVariant)"/i);
});

test("B1 migration creates every approved constraint and index", () => {
  for (const fragment of [
    'CREATE TYPE "OrderEmailEventType"',
    'CREATE TYPE "OrderEmailStatus"',
    'CREATE TABLE "OrderEmailOutbox"',
    'OrderEmailOutbox_providerMessageId_key',
    'OrderEmailOutbox_orderId_eventType_key',
    'OrderEmailOutbox_status_nextAttemptAt_createdAt_idx',
    'OrderEmailOutbox_status_claimedAt_idx',
    '"attemptCount" >= 0',
    '"templateVersion" >= 1',
    'OrderEmailOutbox_rendered_content_complete_check',
    '"renderedSubject" IS NULL AND "renderedHtml" IS NULL AND "renderedText" IS NULL',
    '"renderedSubject" IS NOT NULL AND "renderedHtml" IS NOT NULL AND "renderedText" IS NOT NULL',
    '"status" <> \'SENDING\'',
    '"claimedAt" IS NOT NULL',
    '"claimToken" IS NOT NULL',
    '"status" <> \'SENT\'',
    '"sentAt" IS NOT NULL',
    '"providerMessageId" IS NOT NULL',
    'OrderEmailOutbox_orderId_fkey',
  ]) assert.ok(migration.includes(fragment), fragment);
});

test("B3 installs only the approved provider dependency and keeps application routes outside scope", () => {
  const packageJson = JSON.parse(source("package.json"));
  assert.match(packageJson.dependencies?.resend, /^\^6\.32\.0$/);
  for (const dependency of ["@react-email/components", "@react-email/render", "nodemailer", "sendgrid", "postmark"]) {
    assert.equal(packageJson.dependencies?.[dependency], undefined);
    assert.equal(packageJson.devDependencies?.[dependency], undefined);
  }
  assert.doesNotMatch(source("app/api/webhooks/yoco/route.ts"), /OrderEmailOutbox|ORDER_CONFIRMED|orderEmailOutbox/);
});

test("snapshot contract excludes live and sensitive authorities", () => {
  const contract = source("lib/email/order-email-types.ts");
  for (const forbidden of [
    "userId", "addressId", "transactionId", "providerCheckoutId", "idempotencyKey",
    "adminUserId", "inventory", "salePrice", "saleStartsAt", "saleEndsAt",
  ]) assert.doesNotMatch(contract, new RegExp(`\\b${forbidden}\\b`), forbidden);
});

test("B2 enqueue helper uses only its supplied transaction and historical snapshot fields", () => {
  const enqueue = source("lib/email/enqueue-order-email.ts");
  assert.match(enqueue, /tx: Prisma\.TransactionClient/);
  assert.match(enqueue, /await tx\.order\.findUnique/);
  assert.match(enqueue, /await tx\.orderEmailOutbox\.create/);
  assert.match(enqueue, /items:\s*\{[\s\S]*orderBy:\s*\{ id: "asc" \}/);
  assert.doesNotMatch(enqueue, /@\/lib\/prisma|tx\.(?:user|product|productVariant|inventory|payment)\./);
  for (const forbidden of ["idempotencyKey", "addressId", "userId", "transactionId", "providerCheckoutId"]) {
    assert.doesNotMatch(enqueue, new RegExp(`\\b${forbidden}\\b`), forbidden);
  }
});

test("B2 performs no external email or network work", () => {
  const sources = [
    "lib/email/enqueue-order-email.ts",
    "lib/payments/process-yoco-webhook.ts",
    "lib/admin/orders/mutations.ts",
  ].map(source).join("\n");
  assert.doesNotMatch(sources, /\bresend\b|\baxios\b|\bfetch\s*\(|EmailProvider|RESEND_API_KEY|process\.env/i);
});

test("B2 integrates enqueue after authoritative writes while leaving ETA isolated", () => {
  const payment = source("lib/payments/process-yoco-webhook.ts");
  assert.match(payment, /await tx\.payment\.update[\s\S]*await tx\.order\.update[\s\S]*await enqueueOrderEmail\(tx, payment\.order\.id, "ORDER_CONFIRMED", confirmedAt\)/);
  const fulfilment = source("lib/admin/orders/mutations.ts");
  const transitionSection = fulfilment.slice(fulfilment.indexOf("export async function transitionAdminOrder"), fulfilment.indexOf("export async function setAdminOrderEstimate"));
  const estimateSection = fulfilment.slice(fulfilment.indexOf("export async function setAdminOrderEstimate"));
  assert.match(transitionSection, /await tx\.order\.update[\s\S]*await enqueueOrderEmail/);
  assert.doesNotMatch(estimateSection, /enqueueOrderEmail/);
});

test("B2 preserves raw historical recipients for later transport validation", () => {
  const enqueue = source("lib/email/enqueue-order-email.ts");
  assert.match(enqueue, /recipientEmail: order\.customerEmail/);
  assert.match(enqueue, /recipientName: order\.customerName/);
  assert.doesNotMatch(enqueue, /normalizeOrderEmailRecipient|parseOrderEmailSnapshotV1/);
});

test("B3 templates and provider contracts remain server-only and database-independent", () => {
  const paths = [
    "lib/email/provider.ts",
    "lib/email/resend-provider.ts",
    "lib/email/render-order-email.ts",
    "lib/email/templates/order-email-v1.ts",
  ];
  const sources = paths.map(source);
  for (const [index, value] of sources.entries()) {
    assert.match(value, /^import "server-only";/, paths[index]);
    assert.doesNotMatch(value, /@\/lib\/prisma|\b(?:User|Product|ProductVariant|Inventory|Payment)\b/, paths[index]);
  }
  assert.doesNotMatch(source("lib/email/render-order-email.ts"), /process\.env|\bResend\b/);
  assert.doesNotMatch(source("lib/email/templates/order-email-v1.ts"), /process\.env|\bResend\b/);
});

test("B3 rendering is deterministic and provider initialization is lazy", () => {
  const renderer = `${source("lib/email/render-order-email.ts")}\n${source("lib/email/templates/order-email-v1.ts")}`;
  assert.doesNotMatch(renderer, /Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random\s*\(|randomUUID|process\.env/);
  const provider = source("lib/email/resend-provider.ts");
  assert.match(provider, /export function createResendEmailProvider\(/);
  assert.match(provider, /readApiKey: \(\) => string \| undefined = \(\) => process\.env\.RESEND_API_KEY/);
  assert.match(provider, /const apiKey = readApiKey\(\)\?\.trim\(\)/);
  assert.match(provider, /if \(!apiKey\) throw new EmailConfigurationError\(\)/);
  assert.doesNotMatch(provider.slice(0, provider.indexOf("export function createResendEmailProvider(")), /new Resend\s*\(/);
});

test("B3 provider and rendering modules cannot mutate outbox state", () => {
  const files = [
    "lib/email/provider.ts",
    "lib/email/resend-provider.ts",
    "lib/email/render-order-email.ts",
    "lib/email/templates/order-email-v1.ts",
  ].map(source).join("\n");
  assert.doesNotMatch(files, /orderEmailOutbox|attemptCount|claimedAt|claimToken|lastAttemptAt|sentAt/);
});

test("B4 dispatcher uses one-row PostgreSQL claims, a bounded lease and guarded finalization", () => {
  const dispatcher = source("lib/email/dispatch-order-emails.ts");
  assert.match(dispatcher, /ORDER_EMAIL_CLAIM_LEASE_MS = 10 \* 60 \* 1000/);
  assert.match(dispatcher, /ORDER_EMAIL_DISPATCH_LIMIT = 10/);
  assert.match(dispatcher, /FOR UPDATE SKIP LOCKED[\s\S]*LIMIT 1/);
  assert.match(dispatcher, /NOT EXISTS[\s\S]*earlier\."orderId" = candidate\."orderId"/);
  for (const ranking of [
    "WHEN 'ORDER_CONFIRMED' THEN 1",
    "WHEN 'ORDER_PROCESSING' THEN 2",
    "WHEN 'ORDER_SHIPPED' THEN 3",
    "WHEN 'ORDER_READY_FOR_PICKUP' THEN 3",
    "WHEN 'ORDER_COMPLETED' THEN 4",
  ]) assert.ok(dispatcher.includes(ranking), ranking);
  assert.match(dispatcher, /status: "SENDING"[\s\S]*claimedAt: now[\s\S]*claimToken: token[\s\S]*attemptCount: \{ increment: 1 \}/);
  assert.match(dispatcher, /where: \{ id: event\.id, status: "SENDING", claimToken: event\.claimToken \}/);
  assert.match(dispatcher, /renderedSubject: rendered\.subject[\s\S]*renderedHtml: rendered\.html[\s\S]*renderedText: rendered\.text/);
  assert.ok(dispatcher.indexOf("renderedSubject: rendered.subject") < dispatcher.indexOf("dependencies.provider.send"));
  assert.match(dispatcher, /createAbortSignal: \(\) => AbortSignal\.timeout\(ORDER_EMAIL_PROVIDER_TIMEOUT_MS\)/);
  assert.doesNotMatch(dispatcher, /\$executeRawUnsafe|\$queryRawUnsafe/);
  const wrapper = dispatcher.slice(dispatcher.indexOf("export async function dispatchOrderEmails("));
  assert.ok(wrapper.indexOf("getOrderEmailAppOrigin()") < wrapper.indexOf("createResendEmailProvider()"));
  assert.ok(wrapper.indexOf("createResendEmailProvider()") < wrapper.indexOf("dispatchOrderEmailsWithDependencies"));
});

test("B4 dispatcher writes only OrderEmailOutbox and keeps authority models untouched", () => {
  const dispatcher = source("lib/email/dispatch-order-emails.ts");
  assert.match(dispatcher, /(?:tx|database)\.orderEmailOutbox\.(?:update|updateMany)/);
  assert.doesNotMatch(dispatcher, /\.(?:order|payment|inventory|cart|product|productVariant|user)\.(?:create|update|updateMany|delete|deleteMany|upsert)/i);
  assert.doesNotMatch(dispatcher, /enqueueOrderEmail/);
});

test("B2 authority services stay free of providers, dispatcher and after", () => {
  for (const path of ["lib/payments/process-yoco-webhook.ts", "lib/admin/orders/mutations.ts"]) {
    const value = source(path);
    assert.doesNotMatch(value, /\bResend\b|EmailProvider|dispatchOrderEmails|\bafter\s*\(/, path);
  }
});

test("fulfilment email mapping is exhaustive and has no completion fallback", () => {
  const fulfilment = source("lib/admin/orders/mutations.ts");
  assert.match(fulfilment, /switch \(targetStatus\)/);
  for (const target of ["PROCESSING", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED"]) {
    assert.match(fulfilment, new RegExp(`case "${target}"`));
  }
  assert.match(fulfilment, /const exhaustive: never = targetStatus/);
  assert.doesNotMatch(fulfilment, /return "ORDER_COMPLETED";\s*\}/);
});

test("B4 fast paths use after and the shared durable dispatcher only at route boundaries", () => {
  const webhook = source("app/api/webhooks/yoco/route.ts");
  const fulfilment = source("app/api/admin/orders/[orderId]/fulfilment/route.ts");
  for (const value of [webhook, fulfilment]) {
    assert.match(value, /import \{ after(?:, NextResponse)? \} from "next\/server"|import \{ after, NextResponse \} from "next\/server"/);
    assert.match(value, /dispatchOrderEmails\(\{ limit: 1 \}\)/);
    assert.match(value, /Order email background dispatch failed\./);
    assert.doesNotMatch(value, /\bResend\b|createResendEmailProvider|EmailProvider|RESEND_API_KEY/);
  }
  assert.match(webhook, /if \(result === "processed"\) \{\s*after/);
});

test("B4 maintenance routes share bearer-secret authorization and expose no provider details", () => {
  const authorization = source("lib/maintenance/authorization.ts");
  const expiry = source("app/api/internal/maintenance/expire-unpaid-orders/route.ts");
  const email = source("app/api/internal/maintenance/send-order-emails/route.ts");
  assert.match(authorization, /DEIGON_MAINTENANCE_SECRET/);
  assert.match(authorization, /secret\.length >= 32/);
  assert.match(authorization, /timingSafeEqual/);
  assert.doesNotMatch(authorization, /searchParams|cookie/i);
  assert.match(expiry, /authorizeMaintenanceRequest\(request\)/);
  assert.match(email, /authorizeMaintenanceRequest\(request\)/);
  assert.match(email, /dispatchOrderEmails\(\)/);
  assert.doesNotMatch(email, /recipientEmail|recipientName|orderId|providerMessageId|claimToken|payload/);
});

test("B5B-R2 adds no migration or Vercel scheduler configuration", () => {
  const migrations = readdirSync(`${root}/prisma/migrations`).filter((name) => /^\d/.test(name)).sort();
  assert.equal(migrations.at(-1), "20261002000000_order_email_outbox");
  assert.equal(existsSync(`${root}/vercel.json`), false);
  assert.equal(existsSync(`${root}/app/api/internal/cron/send-order-emails/route.ts`), false);
  assert.equal(existsSync(`${root}/app/api/internal/scheduler/send-order-emails/route.ts`), true);
});

test("B5B-R2 keeps scheduler and maintenance POST trust boundaries separate", () => {
  const authorization = source("lib/maintenance/authorization.ts");
  const maintenance = source("app/api/internal/maintenance/send-order-emails/route.ts");
  const expiry = source("app/api/internal/maintenance/expire-unpaid-orders/route.ts");
  const scheduler = source("app/api/internal/scheduler/send-order-emails/route.ts");
  assert.match(authorization, /process\.env\.DEIGON_MAINTENANCE_SECRET/);
  assert.match(authorization, /process\.env\.DEIGON_ORDER_EMAIL_SCHEDULER_SECRET/);
  assert.doesNotMatch(authorization, /\bCRON_SECRET\b|NEXT_PUBLIC/);
  assert.match(authorization, /timingSafeEqual/);
  assert.match(authorization, /secret\.length >= 32/);
  assert.match(maintenance, /export async function POST\(request: Request\)/);
  assert.doesNotMatch(maintenance, /export (?:async )?function GET|export const GET/);
  assert.match(maintenance, /authorizeMaintenanceRequest\(request\)/);
  assert.match(maintenance, /dispatchOrderEmails\(\)/);
  assert.doesNotMatch(maintenance, /\bResend\b|createResendEmailProvider|EmailProvider|RESEND_API_KEY/);
  assert.doesNotMatch(maintenance, /searchParams|cookie/i);
  assert.match(expiry, /authorizeMaintenanceRequest\(request\)/);
  assert.match(scheduler, /export async function POST\(request: Request\)/);
  assert.doesNotMatch(scheduler, /export (?:async )?function GET|export const GET/);
  assert.match(scheduler, /authorizeOrderEmailSchedulerRequest\(request\)/);
  assert.match(scheduler, /dispatchOrderEmails\(\{ limit: 2 \}\)/);
  assert.doesNotMatch(scheduler, /\bResend\b|createResendEmailProvider|EmailProvider|RESEND_API_KEY/);
  assert.doesNotMatch(scheduler, /searchParams|cookie/i);

  const schedulerSecretReferences = ["app", "lib"].flatMap(filesUnder)
    .filter((path) => source(path).includes("DEIGON_ORDER_EMAIL_SCHEDULER_SECRET"));
  assert.deepEqual(schedulerSecretReferences, ["lib/maintenance/authorization.ts"]);
});

test("B5B-R2 operations guide documents the dedicated external scheduler boundary", () => {
  const operations = source("docs/order-email-dispatch.md");
  assert.match(operations, /at-least-once dispatch processing with strong duplicate suppression/);
  assert.match(operations, /stale_claim_after_max_attempts/);
  assert.match(operations, /external scheduler calls `POST \/api\/internal\/scheduler\/send-order-emails` every minute/i);
  assert.match(operations, /https:\/\/www\.deigon\.co\.za\/api\/internal\/scheduler\/send-order-emails/);
  assert.match(operations, /Authorization: Bearer <DEIGON_ORDER_EMAIL_SCHEDULER_SECRET>/);
  assert.match(operations, /at most two sequential events/);
  assert.match(operations, /30-second request window/);
  assert.match(operations, /`POST \/api\/internal\/maintenance\/send-order-emails` remains available for controlled manual maintenance/);
  assert.match(operations, /continues to use `DEIGON_MAINTENANCE_SECRET`/);
  assert.match(operations, /never place it in the URL or query parameters/);
  assert.match(operations, /monitor repeated failures with alerts/i);
  assert.match(operations, /not a guarantee of uninterrupted uptime/);
  assert.doesNotMatch(operations, /\bCRON_SECRET\b|Vercel Cron/);
  assert.match(operations, /`RESEND_API_KEY` is read only by the Resend provider adapter/);
  assert.match(operations, /`nextAttemptAt` remains authoritative/);
  assert.match(operations, /Missed scheduler invocations do not remove or lose outbox events/);
  assert.match(operations, /`after\(\)` callbacks remain the immediate best-effort path/);
  assert.match(operations, /recurring external scheduler is the recovery authority/);
  assert.match(operations, /ten minutes/);
  assert.match(operations, /eighth attempt becomes `DEAD`/);
  assert.match(operations, /not a claim of mathematically exactly-once/);
  assert.match(operations, /does not backfill historical orders/);
  assert.match(operations, /cutover gap/);
  assert.match(operations, /`SENT` means Resend accepted the request/);
  assert.match(operations, /roll the application back while leaving the additive outbox schema in place/);
});

test("B5B shipping policy promises an email without unsupported tracking wording", () => {
  const policy = source("app/policies/shipping-policy/page.tsx");
  assert.doesNotMatch(policy, /tracking number/i);
  assert.match(policy, /You will receive an email when your delivery order is out for delivery\./);
});
