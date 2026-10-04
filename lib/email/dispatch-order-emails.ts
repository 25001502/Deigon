import "server-only";

import { randomUUID } from "node:crypto";
import type { OrderEmailEventType, Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrderEmailAppOrigin } from "./order-email-config";
import { normalizeOrderEmailRecipient, parseOrderEmailSnapshotV1 } from "./order-email-snapshot";
import {
  ORDER_EMAIL_MAX_ATTEMPTS,
  nextOrderEmailAttemptAt,
} from "./order-email-retry";
import { ORDER_EMAIL_TEMPLATE_VERSION } from "./order-email-types";
import {
  orderEmailProviderIdempotencyKey,
  type EmailProvider,
  type EmailProviderFailure,
  type EmailProviderResult,
} from "./provider";
import { normalizeOrderEmailAppOrigin, renderOrderEmail } from "./render-order-email";
import { createResendEmailProvider } from "./resend-provider";

export const ORDER_EMAIL_CLAIM_LEASE_MS = 10 * 60 * 1000;
export const ORDER_EMAIL_PROVIDER_TIMEOUT_MS = 10 * 1000;
export const ORDER_EMAIL_DISPATCH_LIMIT = 10;

export type DispatchOrderEmailsSummary = {
  examined: number;
  sent: number;
  retried: number;
  dead: number;
  staleRecovered: number;
  lostClaims: number;
  configurationBlocked: boolean;
};

export type DispatchOrderEmailsOptions = {
  limit?: number;
};

export type DispatchOrderEmailsDependencies = {
  database: PrismaClient;
  provider: EmailProvider;
  clock: () => Date;
  claimToken: () => string;
  appOrigin: string;
  createAbortSignal: () => AbortSignal;
};

type CandidateRow = {
  id: string;
  eventType: OrderEmailEventType;
  status: "PENDING" | "SENDING";
  recipientEmail: string;
  recipientName: string;
  templateVersion: number;
  payload: Prisma.JsonValue;
  renderedSubject: string | null;
  renderedHtml: string | null;
  renderedText: string | null;
  attemptCount: number;
  claimedAt: Date | null;
};

type ClaimedEvent = Omit<CandidateRow, "status"> & {
  status: "SENDING";
  claimToken: string;
  wasStale: boolean;
};

type ClaimResult =
  | { kind: "none" }
  | { kind: "terminal"; wasStale: boolean }
  | { kind: "claimed"; event: ClaimedEvent };

const transactionOptions = { maxWait: 5_000, timeout: 10_000 };

function dispatchNow(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Order email dispatcher clock is invalid.");
  }
  return new Date(value.getTime());
}

function validateLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > ORDER_EMAIL_DISPATCH_LIMIT) {
    throw new Error("Order email dispatch limit is invalid.");
  }
  return value;
}

function validateClaimToken(value: string): string {
  if (!value || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Order email claim token is invalid.");
  }
  return value;
}

function safeProviderCode(value: string, fallback: string): string {
  return /^[a-z0-9_]{1,100}$/.test(value) ? value : fallback;
}

async function claimOne(
  database: PrismaClient,
  now: Date,
  claimToken: () => string,
): Promise<ClaimResult> {
  const staleBefore = new Date(now.getTime() - ORDER_EMAIL_CLAIM_LEASE_MS);
  return database.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<CandidateRow[]>`
      SELECT
        candidate."id",
        candidate."eventType",
        candidate."status",
        candidate."recipientEmail",
        candidate."recipientName",
        candidate."templateVersion",
        candidate."payload",
        candidate."renderedSubject",
        candidate."renderedHtml",
        candidate."renderedText",
        candidate."attemptCount",
        candidate."claimedAt"
      FROM "OrderEmailOutbox" candidate
      WHERE
        (
          (
            candidate."status" = 'SENDING'
            AND candidate."claimedAt" <= ${staleBefore}
          )
          OR
          (
            candidate."status" = 'PENDING'
            AND candidate."nextAttemptAt" <= ${now}
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "OrderEmailOutbox" earlier
          WHERE
            earlier."orderId" = candidate."orderId"
            AND earlier."status" IN ('PENDING', 'SENDING')
            AND CASE earlier."eventType"
              WHEN 'ORDER_CONFIRMED' THEN 1
              WHEN 'ORDER_PROCESSING' THEN 2
              WHEN 'ORDER_SHIPPED' THEN 3
              WHEN 'ORDER_READY_FOR_PICKUP' THEN 3
              WHEN 'ORDER_COMPLETED' THEN 4
            END < CASE candidate."eventType"
              WHEN 'ORDER_CONFIRMED' THEN 1
              WHEN 'ORDER_PROCESSING' THEN 2
              WHEN 'ORDER_SHIPPED' THEN 3
              WHEN 'ORDER_READY_FOR_PICKUP' THEN 3
              WHEN 'ORDER_COMPLETED' THEN 4
            END
        )
      ORDER BY
        CASE WHEN candidate."status" = 'SENDING' THEN 0 ELSE 1 END,
        CASE WHEN candidate."status" = 'SENDING' THEN candidate."claimedAt" ELSE candidate."nextAttemptAt" END,
        candidate."createdAt",
        candidate."id"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    if (rows.length === 0) return { kind: "none" };

    const row = rows[0];
    const wasStale = row.status === "SENDING";
    if (row.attemptCount >= ORDER_EMAIL_MAX_ATTEMPTS) {
      // A send may have succeeded before the prior worker crashed. Once the lease is stale at
      // the attempt ceiling, stop rather than risk an unbounded duplicate in that ambiguous window.
      await tx.orderEmailOutbox.update({
        where: { id: row.id },
        data: {
          status: "DEAD",
          claimedAt: null,
          claimToken: null,
          lastErrorCode: wasStale ? "stale_claim_after_max_attempts" : "retry_attempts_exhausted",
          lastError: "Email delivery attempts were exhausted.",
        },
      });
      return { kind: "terminal", wasStale };
    }

    const token = validateClaimToken(claimToken());
    await tx.orderEmailOutbox.update({
      where: { id: row.id },
      data: {
        status: "SENDING",
        claimedAt: now,
        claimToken: token,
        lastAttemptAt: now,
        attemptCount: { increment: 1 },
      },
    });
    return {
      kind: "claimed",
      event: {
        ...row,
        status: "SENDING",
        attemptCount: row.attemptCount + 1,
        claimedAt: now,
        claimToken: token,
        wasStale,
      },
    };
  }, transactionOptions);
}

async function guardedUpdate(
  database: PrismaClient,
  event: ClaimedEvent,
  data: Prisma.OrderEmailOutboxUpdateManyMutationInput,
): Promise<boolean> {
  const result = await database.$transaction(
    (tx) => tx.orderEmailOutbox.updateMany({
      where: { id: event.id, status: "SENDING", claimToken: event.claimToken },
      data,
    }),
    transactionOptions,
  );
  return result.count === 1;
}

async function finalizeDead(
  database: PrismaClient,
  event: ClaimedEvent,
  code: string,
  message: string,
): Promise<boolean> {
  return guardedUpdate(database, event, {
    status: "DEAD",
    claimedAt: null,
    claimToken: null,
    lastErrorCode: code,
    lastError: message,
  });
}

function retryableFailure(code: string): EmailProviderFailure {
  return {
    ok: false,
    kind: "RETRYABLE",
    code,
    statusCode: null,
    retryAfterSeconds: null,
  };
}

type PreparedProviderRequest = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

type PrepareProviderRequestResult =
  | { kind: "ready"; input: PreparedProviderRequest }
  | { kind: "invalid"; invalidCode: string }
  | { kind: "lost-claim" };

async function prepareProviderRequest(
  event: ClaimedEvent,
  dependencies: DispatchOrderEmailsDependencies,
): Promise<PrepareProviderRequestResult> {
  let recipient;
  try {
    recipient = normalizeOrderEmailRecipient({
      recipientEmail: event.recipientEmail,
      recipientName: event.recipientName,
    });
  } catch {
    return { kind: "invalid", invalidCode: "invalid_recipient" };
  }

  const renderedValues = [event.renderedSubject, event.renderedHtml, event.renderedText];
  const hasPersistedRender = renderedValues.every((value) => value !== null);
  if (!hasPersistedRender && renderedValues.some((value) => value !== null)) {
    return { kind: "invalid", invalidCode: "invalid_rendered_email" };
  }

  let rendered: { subject: string; html: string; text: string };
  if (hasPersistedRender) {
    rendered = {
      subject: event.renderedSubject as string,
      html: event.renderedHtml as string,
      text: event.renderedText as string,
    };
  } else {
    if (event.templateVersion !== ORDER_EMAIL_TEMPLATE_VERSION) {
      return { kind: "invalid", invalidCode: "unsupported_template_version" };
    }

    let payload;
    try {
      payload = parseOrderEmailSnapshotV1(event.payload);
    } catch {
      return { kind: "invalid", invalidCode: "invalid_email_payload" };
    }

    let payloadRecipient;
    try {
      payloadRecipient = normalizeOrderEmailRecipient({
        recipientEmail: payload.customer.email,
        recipientName: payload.customer.name,
      });
    } catch {
      return { kind: "invalid", invalidCode: "invalid_email_payload" };
    }
    if (
      recipient.recipientEmail.toLowerCase() !== payloadRecipient.recipientEmail.toLowerCase() ||
      recipient.recipientName !== payloadRecipient.recipientName
    ) {
      return { kind: "invalid", invalidCode: "recipient_snapshot_mismatch" };
    }

    try {
      rendered = renderOrderEmail({
        eventType: event.eventType,
        templateVersion: event.templateVersion,
        payload,
        appOrigin: dependencies.appOrigin,
      });
    } catch {
      return { kind: "invalid", invalidCode: "invalid_email_event" };
    }

    const persisted = await guardedUpdate(dependencies.database, event, {
      renderedSubject: rendered.subject,
      renderedHtml: rendered.html,
      renderedText: rendered.text,
    });
    if (!persisted) return { kind: "lost-claim" };
  }

  return {
    kind: "ready",
    input: {
      to: recipient.recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: orderEmailProviderIdempotencyKey(event.id),
    },
  };
}

async function sendEvent(
  request: PreparedProviderRequest,
  dependencies: DispatchOrderEmailsDependencies,
): Promise<EmailProviderResult> {
  try {
    return await dependencies.provider.send({
      ...request,
      signal: dependencies.createAbortSignal(),
    });
  } catch {
    return retryableFailure("provider_exception");
  }
}

export async function dispatchOrderEmailsWithDependencies(
  dependencies: DispatchOrderEmailsDependencies,
  { limit = ORDER_EMAIL_DISPATCH_LIMIT }: DispatchOrderEmailsOptions = {},
): Promise<DispatchOrderEmailsSummary> {
  const boundedLimit = validateLimit(limit);
  // Validate trusted configuration before the first database claim.
  const appOrigin = normalizeOrderEmailAppOrigin(dependencies.appOrigin);

  const summary: DispatchOrderEmailsSummary = {
    examined: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    staleRecovered: 0,
    lostClaims: 0,
    configurationBlocked: false,
  };

  for (let index = 0; index < boundedLimit; index += 1) {
    const claim = await claimOne(
      dependencies.database,
      dispatchNow(dependencies.clock),
      dependencies.claimToken,
    );
    if (claim.kind === "none") break;

    summary.examined += 1;
    if (claim.kind === "terminal") {
      summary.dead += 1;
      if (claim.wasStale) summary.staleRecovered += 1;
      continue;
    }

    const event = claim.event;
    if (event.wasStale) summary.staleRecovered += 1;
    const prepared = await prepareProviderRequest(event, { ...dependencies, appOrigin });
    if (prepared.kind === "lost-claim") {
      summary.lostClaims += 1;
      continue;
    }
    if (prepared.kind === "invalid") {
      const updated = await finalizeDead(
        dependencies.database,
        event,
        prepared.invalidCode,
        "Order email data is invalid.",
      );
      if (updated) summary.dead += 1;
      else summary.lostClaims += 1;
      continue;
    }

    const result = await sendEvent(prepared.input, { ...dependencies, appOrigin });
    const finalizedAt = dispatchNow(dependencies.clock);

    if (result.ok) {
      const updated = await guardedUpdate(dependencies.database, event, {
        status: "SENT",
        sentAt: finalizedAt,
        providerMessageId: result.providerMessageId,
        claimedAt: null,
        claimToken: null,
        lastErrorCode: null,
        lastError: null,
      });
      if (updated) summary.sent += 1;
      else summary.lostClaims += 1;
      continue;
    }

    if (result.kind === "CONFIGURATION") {
      const updated = await guardedUpdate(dependencies.database, event, {
        status: "PENDING",
        attemptCount: { decrement: 1 },
        nextAttemptAt: new Date(finalizedAt.getTime() + 60 * 60 * 1000),
        claimedAt: null,
        claimToken: null,
        lastErrorCode: safeProviderCode(result.code, "provider_configuration_error"),
        lastError: "Email provider configuration is unavailable.",
      });
      if (updated) summary.retried += 1;
      else summary.lostClaims += 1;
      summary.configurationBlocked = true;
      break;
    }

    if (result.kind === "IDEMPOTENCY_CONFLICT") {
      const updated = await finalizeDead(
        dependencies.database,
        event,
        "provider_idempotency_conflict",
        "Email provider idempotency conflict requires investigation.",
      );
      if (updated) summary.dead += 1;
      else summary.lostClaims += 1;
      continue;
    }

    if (result.kind === "PERMANENT") {
      const updated = await finalizeDead(
        dependencies.database,
        event,
        safeProviderCode(result.code, "provider_permanent_failure"),
        "Email provider rejected the request.",
      );
      if (updated) summary.dead += 1;
      else summary.lostClaims += 1;
      continue;
    }

    if (event.attemptCount >= ORDER_EMAIL_MAX_ATTEMPTS) {
      const updated = await finalizeDead(
        dependencies.database,
        event,
        "retry_attempts_exhausted",
        "Email delivery attempts were exhausted.",
      );
      if (updated) summary.dead += 1;
      else summary.lostClaims += 1;
      continue;
    }

    const updated = await guardedUpdate(dependencies.database, event, {
      status: "PENDING",
      nextAttemptAt: nextOrderEmailAttemptAt(finalizedAt, event.attemptCount, result.retryAfterSeconds),
      claimedAt: null,
      claimToken: null,
      lastErrorCode: safeProviderCode(result.code, "provider_retryable_failure"),
      lastError: "Email delivery will be retried.",
    });
    if (updated) summary.retried += 1;
    else summary.lostClaims += 1;
  }

  return summary;
}

export async function dispatchOrderEmails(
  options: DispatchOrderEmailsOptions = {},
): Promise<DispatchOrderEmailsSummary> {
  const appOrigin = getOrderEmailAppOrigin();
  const provider = createResendEmailProvider();
  return dispatchOrderEmailsWithDependencies({
    database: prisma,
    provider,
    clock: () => new Date(),
    claimToken: randomUUID,
    appOrigin,
    createAbortSignal: () => AbortSignal.timeout(ORDER_EMAIL_PROVIDER_TIMEOUT_MS),
  }, options);
}
