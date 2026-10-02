import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { bundle } from "../admin-a/support/bundle.mjs";

const app = await bundle(`
  export * from './components/admin/dashboard/dashboard-format';
  export * from './components/admin/dashboard/revenue-trend';
  export * from './components/admin/dashboard/admin-dashboard';
`, {
  "next/link": `export default function Link({ children, prefetch: _prefetch, ...props }) { return <a {...props}>{children}</a>; }`,
});

function dashboard(overrides = {}) {
  return {
    reportingAt: "2026-10-01T16:12:00.000Z",
    revenue: {
      current: "18450.00",
      previousComparable: "16140.00",
      comparison: { direction: "UP", percentage: "14.3", absoluteDelta: "2310.00" },
    },
    paidOrders: {
      current: 43,
      previousComparable: 36,
      comparison: { direction: "UP", percentage: "19.4", absoluteDelta: 7 },
    },
    averageOrderValue: {
      current: "429.07",
      previousComparable: "448.33",
      comparison: { direction: "DOWN", percentage: "-4.3", absoluteDelta: "19.26" },
    },
    fulfilment: { awaitingTotal: 9, confirmed: 3, processing: 2, shipped: 3, readyForPickup: 1 },
    inventory: { outOfStock: 2, lowStock: 5, missingInventory: 1, lowStockThreshold: 5 },
    sales: { activeVariants: 4 },
    revenueTrend: [
      { month: "2026-05", revenue: "1200.00", paidOrders: 3 },
      { month: "2026-06", revenue: "0.00", paidOrders: 0 },
      { month: "2026-07", revenue: "3100.10", paidOrders: 8 },
      { month: "2026-08", revenue: "2840.00", paidOrders: 7 },
      { month: "2026-09", revenue: "16140.00", paidOrders: 36 },
      { month: "2026-10", revenue: "18450.00", paidOrders: 43 },
    ],
    recentOrders: Array.from({ length: 6 }, (_, index) => ({
      id: `order-${index + 1}`,
      orderNumber: `DGN-G3-${index + 1}`,
      customerName: index === 0 ? "A customer with a deliberately long display name" : `Customer ${index + 1}`,
      total: `${100 + index}.00`,
      paymentStatus: index === 0 ? "PENDING" : "PAID",
      status: index === 0 ? "PENDING" : "CONFIRMED",
      fulfilmentType: index % 2 ? "PICKUP" : "DELIVERY",
      createdAt: `2026-10-01T1${index}:00:00.000Z`,
    })),
    topSkus: [{ sku: "BB-WHT-S", title: "Blaze Baller historical snapshot", unitsSold: 12, merchandiseRevenue: "3000.00" }],
    ...overrides,
  };
}

test("dashboard money formatting preserves exact decimal strings without Number conversion", () => {
  assert.equal(app.formatExactMoney("0.00"), "R0.00");
  assert.equal(app.formatExactMoney("0.10"), "R0.10");
  assert.equal(app.formatExactMoney("1234.56"), "R1 234.56");
  assert.equal(app.formatExactMoney("18450.00"), "R18 450.00");
  assert.equal(app.formatExactMoney("123456789012345678901234.50"), "R123 456 789 012 345 678 901 234.50");
  assert.equal(app.formatExactMoney("-1200.00"), "-R1 200.00");
  assert.equal(app.formatExactMoney("not-money"), "—");
  const source = readFileSync(new URL("../../components/admin/dashboard/dashboard-format.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Number\(value\)|parseFloat\(|Intl\.NumberFormat/);
});

test("comparison presentation covers UP, DOWN, FLAT and NEW without non-finite output", () => {
  const cases = [
    [{ direction: "UP", percentage: "14.2", absoluteDelta: "1.00" }, "Up 14.2%"],
    [{ direction: "DOWN", percentage: "-8.5", absoluteDelta: "1.00" }, "Down 8.5%"],
    [{ direction: "FLAT", percentage: null, absoluteDelta: "0.00" }, "No change"],
    [{ direction: "NEW", percentage: null, absoluteDelta: "1.00" }, "New"],
  ];
  for (const [comparison, label] of cases) {
    const view = app.comparisonView(comparison);
    assert.equal(view.label, label);
    assert.doesNotMatch(JSON.stringify(view), /Infinity|NaN/);
  }
});

test("revenue insight always describes the same elapsed period", () => {
  for (const [direction, percentage, phrase] of [
    ["UP", "14.2", "up 14.2%"],
    ["DOWN", "-8.5", "down 8.5%"],
    ["FLAT", null, "unchanged"],
    ["NEW", null, "new"],
  ]) {
    const insight = app.revenueInsight({ direction, percentage, absoluteDelta: "0.00" });
    assert.match(insight, new RegExp(phrase, "i"));
    assert.match(insight, /same period last month/i);
  }
});

test("chart scaling uses cents, represents six months and handles all-zero series", () => {
  const points = dashboard().revenueTrend;
  const heights = app.revenueBarHeights(points);
  assert.equal(heights.length, 6);
  assert.equal(heights[1], 0);
  assert.equal(Math.max(...heights), 100);
  assert.deepEqual(app.revenueBarHeights(points.map((point) => ({ ...point, revenue: "0.00" }))), [0, 0, 0, 0, 0, 0]);
  const html = renderToStaticMarkup(app.RevenueTrend({ points }));
  for (const label of ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "R18 450.00", "43 paid orders"]) assert.match(html, new RegExp(label));
  assert.match(html, /<figure/);
  assert.match(html, /<figcaption/);
});

test("dashboard renders KPIs, operations, pending orders and historical SKU snapshots", () => {
  const html = renderToStaticMarkup(app.AdminDashboard({ data: dashboard() }));
  for (const text of [
    "Business overview", "Dashboard", "Revenue this month", "Paid orders", "Average order value",
    "Awaiting fulfilment", "Out of stock", "Low stock", "Missing inventory", "1–5 units",
    "Active sale variants", "Recent orders", "Top-selling SKUs", "Blaze Baller historical snapshot",
    "BB-WHT-S", "12 units", "R3 000.00", "merchandise revenue", "Quick actions", "Pending",
  ]) assert.match(html, new RegExp(text, "i"));
  assert.match(html, /Updated 1 Oct 2026, 18:12 SAST/);
  assert.match(html, /href="\/admin\/inventory"/);
  assert.match(html, /href="\/admin\/products"/);
  assert.doesNotMatch(html, /href="\/admin\/sales"/);
  assert.match(html, /href="\/admin\/orders\/order-1"/);
  assert.doesNotMatch(html, /DGN-G3-6/); // The component never renders beyond the five-row contract.
  assert.doesNotMatch(html, /providerCheckoutId|transactionId|idempotencyKey|userId|addressId/);
  for (const heading of ["Month-to-date performance", "Six-month revenue trend", "Operations", "Recent orders", "Top-selling SKUs", "Quick actions"]) assert.match(html, new RegExp(heading));
  for (const tableHeading of ["Order", "Customer", "Placed", "Total", "Payment", "Status"]) assert.match(html, new RegExp(`<th[^>]*>${tableHeading}</th>`));
});

test("empty dashboard state remains useful and accessible", () => {
  const data = dashboard({
    revenue: { current: "0.00", previousComparable: "0.00", comparison: { direction: "FLAT", percentage: null, absoluteDelta: "0.00" } },
    paidOrders: { current: 0, previousComparable: 0, comparison: { direction: "FLAT", percentage: null, absoluteDelta: 0 } },
    averageOrderValue: { current: null, previousComparable: null, comparison: null },
    fulfilment: { awaitingTotal: 0, confirmed: 0, processing: 0, shipped: 0, readyForPickup: 0 },
    revenueTrend: dashboard().revenueTrend.map((point) => ({ ...point, revenue: "0.00", paidOrders: 0 })),
    recentOrders: [],
    topSkus: [],
  });
  const html = renderToStaticMarkup(app.AdminDashboard({ data }));
  for (const text of ["R0.00", "No paid orders yet", "No orders yet", "No paid product sales in this six-month window", "No retained paid-order revenue"]) assert.match(html, new RegExp(text, "i"));
  assert.doesNotMatch(html, /Infinity|NaN/);
});

test("admin page keeps both authorization layers and renders server-fetched data", async () => {
  let pageGuards = 0;
  let queryCalls = 0;
  globalThis.__adminG3 = {
    guard: () => { pageGuards++; },
    query: async () => { queryCalls++; return dashboard(); },
  };
  const page = await bundle(`export { default as AdminDashboardPage } from './app/admin/(protected)/page';`, {
    "@/lib/auth/require-admin-page": `export async function requireAdminPage() { globalThis.__adminG3.guard(); }`,
    "@/lib/admin/dashboard/queries": `export async function getAdminDashboardData() { return globalThis.__adminG3.query(); }`,
    "@/components/admin/dashboard/admin-dashboard": `export function AdminDashboard({ data }) { return <div>{data.reportingAt}</div>; }`,
  });
  const result = await page.AdminDashboardPage();
  assert.equal(pageGuards, 1);
  assert.equal(queryCalls, 1);
  assert.equal(result.props.data.reportingAt, dashboard().reportingAt);
  delete globalThis.__adminG3;

  const source = readFileSync(new URL("../../app/admin/(protected)/page.tsx", import.meta.url), "utf8");
  assert.match(source, /await requireAdminPage\(\)/);
  assert.match(source, /await getAdminDashboardData\(\)/);
  assert.doesNotMatch(source, /fetch\(|useEffect|useSWR|useQuery|revalidate|unstable_cache/);
});
