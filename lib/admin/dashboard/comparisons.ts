import { Prisma } from "@prisma/client";

import type { CountComparison, MoneyComparison } from "./types";

export function exactMoney(value: string | Prisma.Decimal): string {
  return new Prisma.Decimal(value).toFixed(2);
}

export function averageOrderValue(revenue: string, paidOrders: number): string | null {
  return paidOrders === 0
    ? null
    : new Prisma.Decimal(revenue).div(paidOrders).toFixed(2, Prisma.Decimal.ROUND_HALF_UP);
}

function percentage(current: Prisma.Decimal, previous: Prisma.Decimal): string | null {
  return previous.isZero()
    ? null
    : current.minus(previous).div(previous).mul(100).toFixed(1, Prisma.Decimal.ROUND_HALF_UP);
}

export function compareMoney(currentValue: string, previousValue: string): MoneyComparison {
  const current = new Prisma.Decimal(currentValue);
  const previous = new Prisma.Decimal(previousValue);
  const difference = current.minus(previous);
  return {
    direction: previous.isZero() ? (current.isZero() ? "FLAT" : "NEW")
      : difference.gt(0) ? "UP" : difference.lt(0) ? "DOWN" : "FLAT",
    percentage: percentage(current, previous),
    absoluteDelta: difference.abs().toFixed(2),
  };
}

export function compareCounts(currentValue: number, previousValue: number): CountComparison {
  const current = new Prisma.Decimal(currentValue);
  const previous = new Prisma.Decimal(previousValue);
  return {
    direction: previous.isZero() ? (current.isZero() ? "FLAT" : "NEW")
      : current.gt(previous) ? "UP" : current.lt(previous) ? "DOWN" : "FLAT",
    percentage: percentage(current, previous),
    absoluteDelta: Math.abs(currentValue - previousValue),
  };
}
