import type { DashboardData } from "@/lib/admin/dashboard/types";

import { exactMoneyToCents, formatExactMoney, formatTrendMonth } from "./dashboard-format";

type TrendPoint = DashboardData["revenueTrend"][number];

export function revenueBarHeights(points: TrendPoint[]): number[] {
  const cents = points.map((point) => {
    const value = exactMoneyToCents(point.revenue);
    return value !== null && value > BigInt(0) ? value : BigInt(0);
  });
  const maximum = cents.reduce((largest, value) => value > largest ? value : largest, BigInt(0));
  if (maximum === BigInt(0)) return cents.map(() => 0);
  return cents.map((value) => value === BigInt(0)
    ? 0
    : Math.max(8, Number((value * BigInt(100)) / maximum)));
}

export function RevenueTrend({ points }: { points: TrendPoint[] }) {
  const heights = revenueBarHeights(points);
  const allZero = heights.every((height) => height === 0);
  const summary = points.map((point) => `${formatTrendMonth(point.month)}: ${formatExactMoney(point.revenue)}, ${point.paidOrders} paid orders`).join("; ");

  return (
    <figure aria-labelledby="revenue-trend-title" aria-describedby="revenue-trend-description" className="min-w-0 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
      <figcaption>
        <p className="text-xs font-semibold uppercase tracking-widest text-forest">Revenue analytics</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="revenue-trend-title" className="text-xl font-semibold text-ink">Six-month revenue trend</h2>
            <p id="revenue-trend-description" className="mt-1 text-sm leading-6 text-ink/60">Retained paid-order revenue by SAST calendar month. The latest month is partial.</p>
          </div>
          <p className="text-xs font-medium text-ink/50">Revenue includes shipping</p>
        </div>
      </figcaption>

      <p className="sr-only">{summary}</p>
      <div className="mt-7 grid h-52 grid-cols-6 items-end gap-1 sm:gap-3" aria-hidden="true">
        {points.map((point, index) => (
          <div key={point.month} className="flex h-full min-w-0 flex-col justify-end">
            <div className="flex min-h-0 flex-1 items-end justify-center rounded-t-lg bg-paper/70 px-1">
              <div
                className={`w-full max-w-12 rounded-t-md ${index === points.length - 1 ? "bg-forest" : "bg-brass"}`}
                style={{ height: allZero ? "2px" : heights[index] === 0 ? "2px" : `${heights[index]}%` }}
              />
            </div>
            <p className="mt-2 truncate text-center text-xs font-semibold text-ink">{formatTrendMonth(point.month)}</p>
          </div>
        ))}
      </div>

      {allZero ? <p className="mt-5 rounded-xl bg-paper px-4 py-3 text-sm text-ink/65">No retained paid-order revenue has been recorded in this six-month window.</p> : null}
      <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {points.map((point) => (
          <div key={point.month} className="min-w-0 rounded-xl bg-paper/65 p-3">
            <dt className="text-xs font-semibold text-ink/55">{formatTrendMonth(point.month)}</dt>
            <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-ink" title={formatExactMoney(point.revenue)}>{formatExactMoney(point.revenue)}</dd>
            <dd className="mt-1 text-xs text-ink/55">{point.paidOrders} paid {point.paidOrders === 1 ? "order" : "orders"}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
