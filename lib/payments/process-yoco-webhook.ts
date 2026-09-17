import "server-only";

import { prisma } from "@/lib/prisma";
import { decimalToCents } from "@/lib/payments/yoco";

type PaymentSucceededEvent = {
  id: string;
  type: "payment.succeeded";
  payload: {
    id: string;
    type: "payment";
    status: "succeeded";
    amount: number;
    currency: string;
    metadata: { checkoutId: string };
  };
};

export type YocoWebhookResult = "processed" | "duplicate" | "ignored";

export class YocoWebhookProcessingError extends Error {
  constructor(
    public readonly status: 400 | 409,
    message: string,
  ) {
    super(message);
    this.name = "YocoWebhookProcessingError";
  }
}

function malformed(): never {
  throw new YocoWebhookProcessingError(400, "Malformed webhook event.");
}

function conflict(): never {
  throw new YocoWebhookProcessingError(409, "Payment reconciliation conflict.");
}

function parseEvent(value: unknown) {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    !("id" in value) || typeof value.id !== "string" || !value.id.trim() ||
    !("type" in value) || typeof value.type !== "string" || !value.type.trim()
  ) {
    return malformed();
  }

  if (value.type !== "payment.succeeded") {
    return null;
  }
  if (
    !("payload" in value) || typeof value.payload !== "object" ||
    value.payload === null || Array.isArray(value.payload)
  ) {
    return malformed();
  }

  const payload = value.payload;
  if (
    !("id" in payload) || typeof payload.id !== "string" || !payload.id.trim() ||
    !("type" in payload) || payload.type !== "payment" ||
    !("status" in payload) || payload.status !== "succeeded" ||
    !("amount" in payload) || typeof payload.amount !== "number" ||
    !Number.isSafeInteger(payload.amount) || payload.amount <= 0 ||
    !("currency" in payload) || typeof payload.currency !== "string" ||
    !payload.currency.trim() ||
    !("metadata" in payload) || typeof payload.metadata !== "object" ||
    payload.metadata === null || Array.isArray(payload.metadata) ||
    !("checkoutId" in payload.metadata) ||
    typeof payload.metadata.checkoutId !== "string" ||
    !payload.metadata.checkoutId.trim()
  ) {
    return malformed();
  }

  return value as PaymentSucceededEvent;
}

export async function processYocoWebhook(value: unknown): Promise<YocoWebhookResult> {
  const event = parseEvent(value);
  if (!event) return "ignored";

  return prisma.$transaction(async (tx) => {
    // Lock both rows so concurrent deliveries observe one serialized state transition.
    const rows = await tx.$queryRaw<Array<{ paymentId: string; orderId: string }>>`
      SELECT
        p."id" AS "paymentId",
        o."id" AS "orderId"
      FROM "Payment" p
      INNER JOIN "Order" o ON o."id" = p."orderId"
      WHERE
        p."provider" = 'YOCO'
        AND p."providerCheckoutId" = ${event.payload.metadata.checkoutId}
      FOR UPDATE OF p, o
    `;
    if (rows.length === 0) return "ignored";
    if (rows.length !== 1) return conflict();

    const payment = await tx.payment.findUnique({
      where: { id: rows[0].paymentId },
      include: { order: true },
    });
    if (!payment || payment.order.id !== rows[0].orderId) return conflict();

    let paymentAmount: number;
    let orderAmount: number;
    try {
      paymentAmount = decimalToCents(payment.amount);
      orderAmount = decimalToCents(payment.order.total);
    } catch {
      return conflict();
    }
    if (
      event.payload.currency !== "ZAR" ||
      !payment.amount.equals(payment.order.total) ||
      paymentAmount !== event.payload.amount ||
      orderAmount !== event.payload.amount
    ) {
      return conflict();
    }

    if (payment.status === "PAID") {
      const compatiblePaidOrder = [
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "READY_FOR_PICKUP",
        "DELIVERED",
      ].includes(payment.order.status);
      if (
        payment.transactionId === event.payload.id &&
        compatiblePaidOrder &&
        payment.order.paymentStatus === "PAID" &&
        payment.order.confirmedAt !== null &&
        payment.order.cancelledAt === null
      ) {
        return "duplicate";
      }
      return conflict();
    }

    if (
      payment.status !== "PENDING" ||
      payment.transactionId !== null ||
      payment.order.status !== "PENDING" ||
      payment.order.paymentStatus !== "PENDING" ||
      payment.order.confirmedAt !== null ||
      payment.order.cancelledAt !== null ||
      payment.order.inventoryReleasedAt !== null
    ) {
      return conflict();
    }

    const confirmedAt = new Date();
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", transactionId: event.payload.id },
    });
    await tx.order.update({
      where: { id: payment.order.id },
      data: {
        status: "CONFIRMED",
        paymentStatus: "PAID",
        confirmedAt,
      },
    });
    return "processed";
  }, { maxWait: 5_000, timeout: 10_000 });
}
