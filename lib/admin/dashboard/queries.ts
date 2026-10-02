import "server-only";

import { Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

import { averageOrderValue, compareCounts, compareMoney, exactMoney } from "./comparisons";
import { dashboardPeriods, storedUtcTimestamp } from "./periods";
import type { DashboardData } from "./types";

export const LOW_STOCK_THRESHOLD = 5;

// Keep this one payment-authority predicate shared by every financial and
// fulfilment aggregate. Provider identifiers are deliberately not business
// reporting authority; the verified webhook maintains the persisted states.
const authoritativePaidOrder = Prisma.sql`
  o."paymentStatus" = 'PAID'
  AND p."status" = 'PAID'
  AND o."confirmedAt" IS NOT NULL
  AND p."amount" = o."total"
  AND o."cancelledAt" IS NULL
  AND o."inventoryReleasedAt" IS NULL
  AND (
    (
      o."fulfilmentType" = 'DELIVERY'
      AND o."status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
    )
    OR (
      o."fulfilmentType" = 'PICKUP'
      AND o."status" IN ('CONFIRMED', 'PROCESSING', 'READY_FOR_PICKUP', 'DELIVERED')
    )
  )
`;

type RawCount = string | number | bigint;
type RawPeriodTotals = {
  currentRevenue: string;
  currentOrders: RawCount;
  previousRevenue: string;
  previousOrders: RawCount;
};
type RawFulfilment = {
  awaitingTotal: RawCount;
  confirmed: RawCount;
  processing: RawCount;
  shipped: RawCount;
  readyForPickup: RawCount;
};
type RawInventory = { outOfStock: RawCount; lowStock: RawCount; missingInventory: RawCount };
type RawTrend = { month: string; revenue: string; paidOrders: RawCount };
type RawTopSku = { sku: string; title: string; unitsSold: RawCount; merchandiseRevenue: string };

function count(value: RawCount): number {
  const integer = BigInt(value);
  if (integer < BigInt(0) || integer > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Dashboard count is outside the supported range");
  }
  return Number(integer);
}

/** Equivalent to resolveVariantPrice(..., at).state === "ACTIVE" for valid persisted rows. */
export function activeSaleWhere(at: Date): Prisma.ProductVariantWhereInput {
  return {
    product: { isActive: true },
    salePrice: { not: null },
    AND: [
      { OR: [{ saleStartsAt: null }, { saleStartsAt: { lte: at } }] },
      { OR: [{ saleEndsAt: null }, { saleEndsAt: { gt: at } }] },
    ],
  };
}

export async function getAdminDashboardData(at?: Date): Promise<DashboardData> {
  await requireAdmin();
  const reportingAt = at ?? new Date();
  const periods = dashboardPeriods(reportingAt);
  const currentStart = storedUtcTimestamp(periods.current.start);
  const currentEnd = storedUtcTimestamp(periods.current.end);
  const previousStart = storedUtcTimestamp(periods.previousComparable.start);
  const previousEnd = storedUtcTimestamp(periods.previousComparable.end);
  const trendStart = storedUtcTimestamp(periods.trendStart);

  return prisma.$transaction(async (tx) => {
    // Must be the first statement in this RepeatableRead transaction. Even a
    // mistaken future write in this module will then be rejected by PostgreSQL.
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;

    // confirmedAt is TIMESTAMP(3) WITHOUT TIME ZONE. Prisma stores JS Dates as
    // UTC wall-clock values, so compare explicit UTC wall-clock strings rather
    // than allowing an implicit session-timezone conversion from timestamptz.
    const periodRows = await tx.$queryRaw<RawPeriodTotals[]>`
      SELECT
        COALESCE(SUM(o."total") FILTER (WHERE o."confirmedAt" >= ${currentStart}::timestamp(3) AND o."confirmedAt" < ${currentEnd}::timestamp(3)), 0)::text AS "currentRevenue",
        (COUNT(*) FILTER (WHERE o."confirmedAt" >= ${currentStart}::timestamp(3) AND o."confirmedAt" < ${currentEnd}::timestamp(3)))::text AS "currentOrders",
        COALESCE(SUM(o."total") FILTER (WHERE o."confirmedAt" >= ${previousStart}::timestamp(3) AND o."confirmedAt" < ${previousEnd}::timestamp(3)), 0)::text AS "previousRevenue",
        (COUNT(*) FILTER (WHERE o."confirmedAt" >= ${previousStart}::timestamp(3) AND o."confirmedAt" < ${previousEnd}::timestamp(3)))::text AS "previousOrders"
      FROM "Order" o
      INNER JOIN "Payment" p ON p."orderId" = o."id"
      WHERE ${authoritativePaidOrder}
        AND o."confirmedAt" >= ${previousStart}::timestamp(3)
        AND o."confirmedAt" < ${currentEnd}::timestamp(3)
    `;
    const totals = periodRows[0];
    const currentRevenue = exactMoney(totals.currentRevenue);
    const previousRevenue = exactMoney(totals.previousRevenue);
    const currentOrders = count(totals.currentOrders);
    const previousOrders = count(totals.previousOrders);
    const currentAov = averageOrderValue(currentRevenue, currentOrders);
    const previousAov = averageOrderValue(previousRevenue, previousOrders);

    const fulfilmentRows = await tx.$queryRaw<RawFulfilment[]>`
      SELECT
        (COUNT(*) FILTER (WHERE
          (o."fulfilmentType" = 'DELIVERY' AND o."status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED'))
          OR (o."fulfilmentType" = 'PICKUP' AND o."status" IN ('CONFIRMED', 'PROCESSING', 'READY_FOR_PICKUP'))
        ))::text AS "awaitingTotal",
        (COUNT(*) FILTER (WHERE o."status" = 'CONFIRMED'))::text AS "confirmed",
        (COUNT(*) FILTER (WHERE o."status" = 'PROCESSING'))::text AS "processing",
        (COUNT(*) FILTER (WHERE o."fulfilmentType" = 'DELIVERY' AND o."status" = 'SHIPPED'))::text AS "shipped",
        (COUNT(*) FILTER (WHERE o."fulfilmentType" = 'PICKUP' AND o."status" = 'READY_FOR_PICKUP'))::text AS "readyForPickup"
      FROM "Order" o
      INNER JOIN "Payment" p ON p."orderId" = o."id"
      WHERE ${authoritativePaidOrder}
    `;
    const workload = fulfilmentRows[0];

    const inventoryRows = await tx.$queryRaw<RawInventory[]>`
      SELECT
        (COUNT(*) FILTER (WHERE i."quantity" = 0))::text AS "outOfStock",
        (COUNT(*) FILTER (WHERE i."quantity" > 0 AND i."quantity" <= ${LOW_STOCK_THRESHOLD}))::text AS "lowStock",
        (COUNT(*) FILTER (WHERE i."id" IS NULL))::text AS "missingInventory"
      FROM "ProductVariant" v
      INNER JOIN "Product" product ON product."id" = v."productId"
      LEFT JOIN "Inventory" i ON i."variantId" = v."id"
      WHERE product."isActive" = true
    `;
    const stock = inventoryRows[0];

    const activeVariants = await tx.productVariant.count({ where: activeSaleWhere(reportingAt) });

    const trendRows = await tx.$queryRaw<RawTrend[]>`
      SELECT
        to_char(date_trunc('month', (o."confirmedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Johannesburg'), 'YYYY-MM') AS "month",
        SUM(o."total")::text AS "revenue",
        COUNT(*)::text AS "paidOrders"
      FROM "Order" o
      INNER JOIN "Payment" p ON p."orderId" = o."id"
      WHERE ${authoritativePaidOrder}
        AND o."confirmedAt" >= ${trendStart}::timestamp(3)
        AND o."confirmedAt" < ${currentEnd}::timestamp(3)
      GROUP BY 1
      ORDER BY 1
    `;
    const trendByMonth = new Map(trendRows.map((row) => [row.month, row]));

    const recentRows = await tx.order.findMany({
      select: {
        id: true, orderNumber: true, customerName: true, total: true,
        paymentStatus: true, status: true, fulfilmentType: true, createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
    });

    // Historical SKU is the grouping identity. Reuse or renaming a SKU can
    // combine distinct catalogue eras, so take the latest qualifying snapshot title.
    const topRows = await tx.$queryRaw<RawTopSku[]>`
      WITH qualified_items AS (
        SELECT oi."id" AS "itemId", oi."sku", oi."title", oi."quantity", oi."lineTotal",
          o."id" AS "orderId", o."confirmedAt"
        FROM "OrderItem" oi
        INNER JOIN "Order" o ON o."id" = oi."orderId"
        INNER JOIN "Payment" p ON p."orderId" = o."id"
        WHERE ${authoritativePaidOrder}
          AND o."confirmedAt" >= ${trendStart}::timestamp(3)
          AND o."confirmedAt" < ${currentEnd}::timestamp(3)
      ), aggregates AS (
        SELECT "sku", SUM("quantity") AS "unitsSold", SUM("lineTotal") AS "merchandiseRevenue"
        FROM qualified_items GROUP BY "sku"
      ), top_five AS (
        SELECT * FROM aggregates
        ORDER BY "unitsSold" DESC, "merchandiseRevenue" DESC, "sku" ASC
        LIMIT 5
      )
      SELECT top_five."sku", top_five."unitsSold"::text AS "unitsSold",
        top_five."merchandiseRevenue"::text AS "merchandiseRevenue",
        (SELECT item."title" FROM qualified_items item WHERE item."sku" = top_five."sku"
          ORDER BY item."confirmedAt" DESC, item."orderId" DESC, item."itemId" DESC LIMIT 1) AS "title"
      FROM top_five
      ORDER BY top_five."unitsSold" DESC, top_five."merchandiseRevenue" DESC, top_five."sku" ASC
    `;

    return {
      reportingAt: reportingAt.toISOString(),
      revenue: { current: currentRevenue, previousComparable: previousRevenue,
        comparison: compareMoney(currentRevenue, previousRevenue) },
      paidOrders: { current: currentOrders, previousComparable: previousOrders,
        comparison: compareCounts(currentOrders, previousOrders) },
      averageOrderValue: { current: currentAov, previousComparable: previousAov,
        comparison: currentAov === null || previousAov === null ? null : compareMoney(currentAov, previousAov) },
      fulfilment: {
        awaitingTotal: count(workload.awaitingTotal), confirmed: count(workload.confirmed),
        processing: count(workload.processing), shipped: count(workload.shipped),
        readyForPickup: count(workload.readyForPickup),
      },
      inventory: {
        outOfStock: count(stock.outOfStock), lowStock: count(stock.lowStock),
        missingInventory: count(stock.missingInventory), lowStockThreshold: LOW_STOCK_THRESHOLD,
      },
      sales: { activeVariants },
      revenueTrend: periods.trendMonths.map((month) => {
        const row = trendByMonth.get(month);
        return { month, revenue: row ? exactMoney(row.revenue) : "0.00", paidOrders: row ? count(row.paidOrders) : 0 };
      }),
      recentOrders: recentRows.map((row) => ({
        id: row.id, orderNumber: row.orderNumber, customerName: row.customerName,
        total: row.total.toFixed(2), paymentStatus: row.paymentStatus,
        status: row.status, fulfilmentType: row.fulfilmentType,
        createdAt: row.createdAt.toISOString(),
      })),
      topSkus: topRows.map((row) => ({
        sku: row.sku, title: row.title, unitsSold: count(row.unitsSold),
        merchandiseRevenue: exactMoney(row.merchandiseRevenue),
      })),
    } satisfies DashboardData;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5_000, timeout: 10_000 });
}
