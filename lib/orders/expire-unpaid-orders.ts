import "server-only";

import { prisma } from "@/lib/prisma";
import {
  MAX_UNPAID_ORDER_TTL_MINUTES,
  MIN_UNPAID_ORDER_TTL_MINUTES,
} from "@/lib/orders/unpaid-order-expiry-config";

export const UNPAID_ORDER_EXPIRY_BATCH_LIMIT = 50;

export type ExpireUnpaidOrdersSummary = {
  examined: number;
  expired: number;
  skipped: number;
  providerBacked: number;
  blocked: number;
};

type ExpireUnpaidOrdersOptions = {
  ttlMinutes: number;
  now?: Date;
  batchLimit?: number;
};

type CandidateResult = "expired" | "skipped" | "providerBacked" | "blocked";

const transactionOptions = {
  maxWait: 5_000,
  timeout: 10_000,
};

function validateOptions({ ttlMinutes, now, batchLimit }: Required<ExpireUnpaidOrdersOptions>) {
  if (
    !Number.isSafeInteger(ttlMinutes) ||
    ttlMinutes < MIN_UNPAID_ORDER_TTL_MINUTES ||
    ttlMinutes > MAX_UNPAID_ORDER_TTL_MINUTES ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isSafeInteger(batchLimit) ||
    batchLimit < 1 ||
    batchLimit > UNPAID_ORDER_EXPIRY_BATCH_LIMIT
  ) {
    throw new Error("Invalid unpaid order expiry options");
  }
}

export async function expireUnpaidOrderCandidate(
  orderId: string,
  cutoff: Date,
  expiredAt: Date,
): Promise<CandidateResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ orderId: string; paymentId: string }>>`
      SELECT
        o."id" AS "orderId",
        p."id" AS "paymentId"
      FROM "Payment" p
      INNER JOIN "Order" o ON o."id" = p."orderId"
      WHERE o."id" = ${orderId}
      FOR UPDATE OF p, o
    `;

    if (locked.length !== 1) return "skipped";

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        createdAt: true,
        status: true,
        paymentStatus: true,
        confirmedAt: true,
        cancelledAt: true,
        inventoryReleasedAt: true,
        payment: {
          select: {
            id: true,
            provider: true,
            status: true,
            transactionId: true,
            providerCheckoutId: true,
          },
        },
        items: {
          select: {
            variantId: true,
            quantity: true,
          },
        },
      },
    });

    if (!order?.payment || order.payment.id !== locked[0].paymentId) {
      return "skipped";
    }

    const pendingOrder =
      order.createdAt <= cutoff &&
      order.status === "PENDING" &&
      order.paymentStatus === "PENDING" &&
      order.confirmedAt === null &&
      order.cancelledAt === null &&
      order.inventoryReleasedAt === null;
    const pendingYocoPayment =
      order.payment.provider === "YOCO" &&
      order.payment.status === "PENDING" &&
      order.payment.transactionId === null;

    if (!pendingOrder || !pendingYocoPayment) return "skipped";
    if (order.payment.providerCheckoutId !== null) return "providerBacked";
    if (order.items.length === 0) return "blocked";

    const quantitiesByVariant = new Map<string, number>();
    for (const item of order.items) {
      if (
        !item.variantId ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return "blocked";
      }

      const quantity = (quantitiesByVariant.get(item.variantId) ?? 0) + item.quantity;
      if (!Number.isSafeInteger(quantity)) return "blocked";
      quantitiesByVariant.set(item.variantId, quantity);
    }

    const variantIds = [...quantitiesByVariant.keys()].sort();
    for (const variantId of variantIds) {
      const inventory = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Inventory"
        WHERE "variantId" = ${variantId}
        FOR UPDATE
      `;
      if (inventory.length !== 1) return "blocked";
    }

    for (const variantId of variantIds) {
      await tx.inventory.update({
        where: { variantId },
        data: {
          quantity: {
            increment: quantitiesByVariant.get(variantId),
          },
        },
      });
    }

    await tx.payment.update({
      where: { id: order.payment.id },
      data: { status: "FAILED" },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        paymentStatus: "FAILED",
        cancelledAt: expiredAt,
        inventoryReleasedAt: expiredAt,
      },
    });

    return "expired";
  }, transactionOptions);
}

export async function expireUnpaidOrders({
  ttlMinutes,
  now = new Date(),
  batchLimit = UNPAID_ORDER_EXPIRY_BATCH_LIMIT,
}: ExpireUnpaidOrdersOptions): Promise<ExpireUnpaidOrdersSummary> {
  validateOptions({ ttlMinutes, now, batchLimit });

  const cutoff = new Date(now.getTime() - ttlMinutes * 60_000);
  const staleProviderWhere = {
    createdAt: { lte: cutoff },
    status: "PENDING" as const,
    paymentStatus: "PENDING" as const,
    confirmedAt: null,
    cancelledAt: null,
    inventoryReleasedAt: null,
    payment: {
      is: {
        provider: "YOCO",
        status: "PENDING" as const,
        transactionId: null,
      },
    },
  };

  const providerBacked = await prisma.order.count({
    where: {
      ...staleProviderWhere,
      payment: {
        is: {
          ...staleProviderWhere.payment.is,
          providerCheckoutId: { not: null },
        },
      },
    },
  });

  const candidates = await prisma.order.findMany({
    where: {
      ...staleProviderWhere,
      payment: {
        is: {
          ...staleProviderWhere.payment.is,
          providerCheckoutId: null,
        },
      },
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: batchLimit,
  });

  const summary: ExpireUnpaidOrdersSummary = {
    examined: providerBacked + candidates.length,
    expired: 0,
    skipped: 0,
    providerBacked,
    blocked: 0,
  };

  for (const candidate of candidates) {
    const result = await expireUnpaidOrderCandidate(candidate.id, cutoff, now);
    summary[result] += 1;
  }

  return summary;
}
