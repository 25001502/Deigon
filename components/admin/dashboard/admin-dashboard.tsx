import {
  ArrowRight,
  BadgePercent,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { orderStatusLabel, paymentStatusLabel } from "@/components/admin/orders/order-ui";
import type { DashboardData, MoneyComparison } from "@/lib/admin/dashboard/types";

import {
  comparisonView,
  formatDashboardDate,
  formatExactMoney,
  formatReportingAt,
  revenueInsight,
  signedMoneyDelta,
} from "./dashboard-format";
import { RevenueTrend } from "./revenue-trend";

type KpiProps = {
  eyebrow: string;
  title: string;
  value: ReactNode;
  icon: ReactNode;
  children: ReactNode;
};

function KpiCard({ eyebrow, title, value, icon, children }: KpiProps) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-neutral-300 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-900">{eyebrow}</p>
          <h2 className="mt-1 text-sm font-medium text-neutral-600">{title}</h2>
        </div>
        <span className="rounded-xl bg-neutral-50 p-2.5 text-neutral-900" aria-hidden="true">{icon}</span>
      </div>
      <div className="mt-5 text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">{value}</div>
      <div className="mt-auto pt-4">{children}</div>
    </section>
  );
}

function ComparisonPill({ comparison }: { comparison: MoneyComparison | DashboardData["paidOrders"]["comparison"] }) {
  const view = comparisonView(comparison);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${view.tone}`}>
      {view.arrow ? <span aria-hidden="true">{view.arrow}</span> : null}
      {view.label}
    </span>
  );
}

function statusTone(status: string) {
  if (status === "PAID" || status === "DELIVERED") return "border border-solid border-neutral-500 bg-neutral-200 text-neutral-950";
  if (status === "FAILED" || status === "REFUNDED" || status === "CANCELLED") return "border border-double border-neutral-600 bg-neutral-100 text-neutral-950";
  if (status === "PENDING") return "border border-dashed border-neutral-500 bg-white text-neutral-900";
  return "border border-solid border-neutral-400 bg-neutral-50 text-neutral-900";
}

function StatusBadge({ status, children }: { status: string; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(status)}`}>{children}</span>;
}

function RecentOrders({ orders }: { orders: DashboardData["recentOrders"] }) {
  return (
    <section aria-labelledby="recent-orders-title" className="min-w-0 rounded-2xl border border-neutral-300 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-900">Order activity</p>
          <h2 id="recent-orders-title" className="mt-2 text-xl font-semibold text-neutral-900">Recent orders</h2>
        </div>
        <Link href="/admin/orders" prefetch={false} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-neutral-900 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">View all orders <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 px-5 py-10 text-center">
          <h3 className="font-semibold text-neutral-900">No orders yet</h3>
          <p className="mt-2 text-sm text-neutral-600">New storefront orders will appear here.</p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid min-w-0 gap-3 lg:hidden">
            {orders.slice(0, 5).map((order) => (
              <article key={order.id} className="min-w-0 rounded-xl bg-neutral-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{order.orderNumber}</p>
                    <p className="mt-1 truncate text-sm text-neutral-600">{order.customerName}</p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-neutral-900">{formatExactMoney(order.total)}</p>
                </div>
                <p className="mt-3 text-xs text-neutral-600">{formatDashboardDate(order.createdAt)} · {order.fulfilmentType === "PICKUP" ? "Pickup" : "Delivery"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge status={order.paymentStatus}>{paymentStatusLabel(order.paymentStatus)}</StatusBadge>
                  <StatusBadge status={order.status}>{orderStatusLabel(order.fulfilmentType, order.status)}</StatusBadge>
                </div>
                <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} prefetch={false} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-neutral-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">View {order.orderNumber}</Link>
              </article>
            ))}
          </div>
          <div className="mt-5 hidden overflow-x-auto lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="border-b border-neutral-300 text-xs uppercase tracking-wider text-neutral-600">
                <tr><th scope="col" className="pb-3 pr-4 font-semibold">Order</th><th scope="col" className="pb-3 pr-4 font-semibold">Customer</th><th scope="col" className="pb-3 pr-4 font-semibold">Placed</th><th scope="col" className="pb-3 pr-4 font-semibold">Total</th><th scope="col" className="pb-3 pr-4 font-semibold">Payment</th><th scope="col" className="pb-3 font-semibold">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-300">
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.id}>
                    <td className="overflow-hidden py-4 pr-3"><Link href={`/admin/orders/${encodeURIComponent(order.id)}`} prefetch={false} className="block truncate font-semibold text-neutral-900 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">{order.orderNumber}</Link><span className="mt-1 block text-xs text-neutral-600">{order.fulfilmentType === "PICKUP" ? "Pickup" : "Delivery"}</span></td>
                    <td className="truncate py-4 pr-3 text-neutral-600" title={order.customerName}>{order.customerName}</td>
                    <td className="py-4 pr-3 text-xs leading-5 text-neutral-600">{formatDashboardDate(order.createdAt)}</td>
                    <td className="py-4 pr-3 text-xs font-semibold tabular-nums text-neutral-900">{formatExactMoney(order.total)}</td>
                    <td className="overflow-hidden py-4 pr-3"><StatusBadge status={order.paymentStatus}>{paymentStatusLabel(order.paymentStatus)}</StatusBadge></td>
                    <td className="overflow-hidden py-4"><StatusBadge status={order.status}>{orderStatusLabel(order.fulfilmentType, order.status)}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function TopSkus({ rows }: { rows: DashboardData["topSkus"] }) {
  return (
    <section aria-labelledby="top-skus-title" className="min-w-0 rounded-2xl border border-neutral-300 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-900">Product performance</p>
      <h2 id="top-skus-title" className="mt-2 text-xl font-semibold text-neutral-900">Top-selling SKUs</h2>
      <p className="mt-1 text-sm leading-6 text-neutral-600">Top five by units sold across the six-month window.</p>
      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 px-5 py-10 text-center">
          <h3 className="font-semibold text-neutral-900">No paid product sales</h3>
          <p className="mt-2 text-sm text-neutral-600">No paid product sales in this six-month window.</p>
        </div>
      ) : (
        <ol className="mt-5 divide-y divide-neutral-300">
          {rows.slice(0, 5).map((row, index) => (
            <li key={row.sku} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-neutral-900" title={row.title}>{row.title}</p>
                <p className="mt-1 break-all text-xs text-neutral-600">SKU {row.sku}</p>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-neutral-600">{row.unitsSold} {row.unitsSold === 1 ? "unit" : "units"}</span>
                  <span className="font-semibold tabular-nums text-neutral-900">{formatExactMoney(row.merchandiseRevenue)} <span className="font-normal text-neutral-600">merchandise revenue</span></span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AdminDashboard({ data }: { data: DashboardData }) {
  const revenueComparison = comparisonView(data.revenue.comparison);
  const paidDelta = data.paidOrders.comparison.absoluteDelta;

  return (
    <div className="min-w-0">
      <header className="rounded-2xl bg-black px-5 py-6 text-white sm:px-7 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-300">Business overview</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">A live view of DEIGON revenue, orders, fulfilment, inventory and active sales.</p>
          </div>
          <p className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70">{formatReportingAt(data.reportingAt)}</p>
        </div>
        <p className="mt-6 border-l-2 border-neutral-600 pl-4 text-sm font-medium leading-6 text-white/90">{revenueInsight(data.revenue.comparison)}</p>
      </header>

      <section aria-labelledby="performance-title" className="mt-6">
        <h2 id="performance-title" className="sr-only">Month-to-date performance</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard eyebrow="Month to date" title="Revenue this month" value={formatExactMoney(data.revenue.current)} icon={<CircleDollarSign size={20} />}>
            <div className="flex flex-wrap items-center gap-2"><ComparisonPill comparison={data.revenue.comparison} /><span className="text-xs font-semibold tabular-nums text-neutral-600">{signedMoneyDelta(data.revenue.comparison)}</span></div>
            <p className="mt-2 text-xs text-neutral-600">{revenueComparison.label} vs same period last month · previous {formatExactMoney(data.revenue.previousComparable)}</p>
          </KpiCard>
          <KpiCard eyebrow="Paid demand" title="Paid orders" value={data.paidOrders.current} icon={<ShoppingBag size={20} />}>
            <div className="flex flex-wrap items-center gap-2"><ComparisonPill comparison={data.paidOrders.comparison} /><span className="text-xs font-semibold tabular-nums text-neutral-600">{data.paidOrders.comparison.direction === "DOWN" ? "−" : data.paidOrders.comparison.direction === "FLAT" ? "" : "+"}{paidDelta} {paidDelta === 1 ? "order" : "orders"}</span></div>
            <p className="mt-2 text-xs text-neutral-600">Compared with {data.paidOrders.previousComparable} in the same period last month</p>
          </KpiCard>
          <KpiCard eyebrow="Order value" title="Average order value" value={data.averageOrderValue.current === null ? <span className="text-xl">No paid orders yet</span> : formatExactMoney(data.averageOrderValue.current)} icon={<ReceiptText size={20} />}>
            {data.averageOrderValue.comparison ? <div className="flex flex-wrap items-center gap-2"><ComparisonPill comparison={data.averageOrderValue.comparison} /><span className="text-xs tabular-nums text-neutral-600">{signedMoneyDelta(data.averageOrderValue.comparison)}</span></div> : <p className="text-xs text-neutral-600">A comparison appears once both periods have paid orders.</p>}
            {data.averageOrderValue.previousComparable !== null ? <p className="mt-2 text-xs text-neutral-600">Previous comparable {formatExactMoney(data.averageOrderValue.previousComparable)}</p> : null}
          </KpiCard>
          <KpiCard eyebrow="Operations" title="Awaiting fulfilment" value={data.fulfilment.awaitingTotal} icon={<PackageCheck size={20} />}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs"><div><dt className="text-neutral-600">Confirmed</dt><dd className="font-semibold tabular-nums text-neutral-900">{data.fulfilment.confirmed}</dd></div><div><dt className="text-neutral-600">Processing</dt><dd className="font-semibold tabular-nums text-neutral-900">{data.fulfilment.processing}</dd></div><div><dt className="text-neutral-600">Shipped</dt><dd className="font-semibold tabular-nums text-neutral-900">{data.fulfilment.shipped}</dd></div><div><dt className="text-neutral-600">Ready for collection</dt><dd className="font-semibold tabular-nums text-neutral-900">{data.fulfilment.readyForPickup}</dd></div></dl>
            <Link href="/admin/orders" prefetch={false} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-neutral-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">Manage fulfilment <ArrowRight size={15} aria-hidden="true" /></Link>
          </KpiCard>
        </div>
      </section>

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(17rem,0.75fr)]">
        <RevenueTrend points={data.revenueTrend} />
        <section aria-labelledby="operations-title" className="min-w-0 rounded-2xl border border-neutral-300 bg-neutral-50/70 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-900">Operational status</p>
          <h2 id="operations-title" className="mt-2 text-xl font-semibold text-neutral-900">Operations</h2>
          <div className="mt-5 rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3"><span className="rounded-lg bg-neutral-50 p-2 text-neutral-900" aria-hidden="true"><Boxes size={18} /></span><h3 className="font-semibold text-neutral-900">Inventory alerts</h3></div>
            <dl className="mt-4 space-y-3 text-sm"><div className="flex items-center justify-between gap-3"><dt className="text-neutral-900">Out of stock</dt><dd className="font-semibold tabular-nums text-neutral-900">{data.inventory.outOfStock}</dd></div><div className="flex items-center justify-between gap-3"><dt className="text-neutral-900">Low stock</dt><dd className="font-semibold tabular-nums text-neutral-900">{data.inventory.lowStock}</dd></div><div className="flex items-center justify-between gap-3"><dt className="font-medium text-neutral-900">Missing inventory</dt><dd className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold tabular-nums text-neutral-900">{data.inventory.missingInventory}</dd></div></dl>
            <p className="mt-4 text-xs text-neutral-600">Low stock = 1–{data.inventory.lowStockThreshold} units. Missing inventory is tracked separately from zero stock.</p>
            <Link href="/admin/inventory" prefetch={false} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-neutral-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">Review inventory <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className="mt-4 rounded-xl bg-black p-4 text-white">
            <div className="flex items-center gap-3"><span className="rounded-lg bg-white/10 p-2 text-neutral-300" aria-hidden="true"><BadgePercent size={18} /></span><h3 className="font-semibold">Active sale variants</h3></div>
            <p className="mt-4 text-3xl font-semibold tabular-nums">{data.sales.activeVariants}</p>
            <p className="mt-2 text-xs leading-5 text-white/65">Variants currently using sale pricing.</p>
            <Link href="/admin/products" prefetch={false} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-white underline decoration-brass underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Manage product sales <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </section>
      </div>

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <RecentOrders orders={data.recentOrders} />
        <TopSkus rows={data.topSkus} />
      </div>

      <section aria-labelledby="quick-actions-title" className="mt-6 rounded-2xl border border-neutral-300 bg-neutral-50/60 p-5 sm:p-6">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-neutral-900">Shortcuts</p><h2 id="quick-actions-title" className="mt-2 text-xl font-semibold text-neutral-900">Quick actions</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { href: "/admin/orders", label: "Review orders", detail: "Payments and fulfilment", icon: <ClipboardList size={18} /> },
            { href: "/admin/products", label: "Manage products", detail: "Catalogue and variants", icon: <ShoppingBag size={18} /> },
            { href: "/admin/inventory", label: "Review inventory", detail: "Stock levels and adjustments", icon: <Boxes size={18} /> },
            { href: "/admin/products", label: "Manage sales", detail: "Variant sale pricing", icon: <BadgePercent size={18} /> },
          ].map((action) => (
            <Link key={action.label} href={action.href} prefetch={false} className="group flex min-h-16 items-center gap-3 rounded-xl border border-neutral-300 bg-white p-4 hover:border-neutral-300 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">
              <span className="rounded-lg bg-neutral-50 p-2 text-neutral-900" aria-hidden="true">{action.icon}</span><span className="min-w-0"><span className="block font-semibold text-neutral-900">{action.label}</span><span className="mt-0.5 block text-xs text-neutral-600">{action.detail}</span></span><ArrowRight size={16} className="ml-auto shrink-0 text-neutral-600 transition group-hover:translate-x-0.5 group-hover:text-neutral-900" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
