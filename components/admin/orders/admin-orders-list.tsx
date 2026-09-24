"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { fetchAdminOrders, type ApiResult } from "./order-api";
import {
  EMPTY_ORDER_FILTERS,
  FULFILMENT_TYPES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  formatDateTime,
  formatMoney,
  orderStatusLabel,
  paymentStatusLabel,
  type AdminOrderListItem,
  type OrderFilters,
} from "./order-ui";

type OrderPage = { orders: AdminOrderListItem[]; nextCursor: string | null };

function statusTone(status: string): string {
  if (status === "PAID" || status === "DELIVERED") return "bg-emerald-50 text-emerald-800 ring-emerald-700/15";
  if (status === "FAILED" || status === "CANCELLED" || status === "REFUNDED") return "bg-red-50 text-red-800 ring-red-700/15";
  if (status === "PENDING") return "bg-amber-50 text-amber-900 ring-amber-700/15";
  return "bg-sky-50 text-sky-800 ring-sky-700/15";
}

function StatusBadge({ children, status }: { children: string; status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusTone(status)}`}>{children}</span>;
}

export function AdminOrdersResults({ orders }: { orders: AdminOrderListItem[] }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink/20 bg-paper/50 px-6 py-12 text-center">
        <h2 className="text-lg font-semibold text-ink">No orders found</h2>
        <p className="mt-2 text-sm text-ink/65">Try changing the submitted search or filters.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:hidden">
        {orders.map((order) => (
          <article key={order.id} className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-forest">{order.fulfilmentType}</p>
                <h2 className="mt-1 font-semibold text-ink">{order.orderNumber}</h2>
                <p className="mt-1 text-sm text-ink/65">{formatDateTime(order.createdAt)}</p>
              </div>
              <p className="font-semibold text-ink">{formatMoney(order.total)}</p>
            </div>
            <div className="mt-4">
              <p className="font-medium text-ink">{order.customerName}</p>
              <p className="break-all text-sm text-ink/65">{order.customerEmail}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge status={order.paymentStatus}>{paymentStatusLabel(order.paymentStatus)}</StatusBadge>
              <StatusBadge status={order.status}>{orderStatusLabel(order.fulfilmentType, order.status)}</StatusBadge>
            </div>
            <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} prefetch={false} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-ink/20 px-4 py-2 text-sm font-semibold text-ink hover:bg-sand/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">View order</Link>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-ink/10 lg:block">
        <table className="min-w-full divide-y divide-ink/10 text-left text-sm">
          <thead className="bg-paper text-xs uppercase tracking-wider text-ink/60">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Order</th>
              <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
              <th scope="col" className="px-4 py-3 font-semibold">Fulfilment</th>
              <th scope="col" className="px-4 py-3 font-semibold">Payment</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">View</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10 bg-white">
            {orders.map((order) => (
              <tr key={order.id} className="align-top hover:bg-paper/50">
                <td className="whitespace-nowrap px-4 py-4">
                  <p className="font-semibold text-ink">{order.orderNumber}</p>
                  <p className="mt-1 text-xs text-ink/60">{formatDateTime(order.createdAt)}</p>
                </td>
                <td className="max-w-56 px-4 py-4">
                  <p className="font-medium text-ink">{order.customerName}</p>
                  <p className="mt-1 truncate text-xs text-ink/60">{order.customerEmail}</p>
                </td>
                <td className="px-4 py-4 text-ink/75">{order.fulfilmentType === "PICKUP" ? "Pickup" : "Delivery"}</td>
                <td className="px-4 py-4"><StatusBadge status={order.paymentStatus}>{paymentStatusLabel(order.paymentStatus)}</StatusBadge></td>
                <td className="px-4 py-4"><StatusBadge status={order.status}>{orderStatusLabel(order.fulfilmentType, order.status)}</StatusBadge></td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-ink">{formatMoney(order.total)}</td>
                <td className="px-4 py-4 text-right">
                  <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} prefetch={false} aria-label={`View order ${order.orderNumber}`} className="rounded-lg px-3 py-2 font-semibold text-forest underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function accessMessage(kind: "unauthenticated" | "forbidden") {
  return kind === "unauthenticated"
    ? "Your admin session has expired. Sign in again to continue."
    : "This account no longer has permission to view admin orders.";
}

export function AdminOrdersList() {
  const [draftFilters, setDraftFilters] = useState<OrderFilters>({ ...EMPTY_ORDER_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<OrderFilters>({ ...EMPTY_ORDER_FILTERS });
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [page, setPage] = useState<OrderPage>({ orders: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<"unauthenticated" | "forbidden" | null>(null);
  const requestVersion = useRef(0);

  const acceptPageResult = useCallback((
    result: ApiResult<OrderPage>,
    filters: OrderFilters,
    cursors: Array<string | null>,
    version: number,
  ) => {
    if (version !== requestVersion.current) return;
    setLoading(false);
    if (result.kind === "ok") {
      setPage(result.data);
      setAppliedFilters(filters);
      setCursorStack(cursors);
      setAccess(null);
      return;
    }
    if (result.kind === "unauthenticated" || result.kind === "forbidden") {
      setAccess(result.kind);
      setPage({ orders: [], nextCursor: null });
      return;
    }
    setError("Orders could not be loaded. Please try again.");
  }, []);

  const loadPage = useCallback(async (filters: OrderFilters, cursors: Array<string | null>, showLoading = true) => {
    const version = ++requestVersion.current;
    if (showLoading) setLoading(true);
    setError(null);
    const result: ApiResult<OrderPage> = await fetchAdminOrders(filters, cursors.at(-1) ?? null);
    acceptPageResult(result, filters, cursors, version);
  }, [acceptPageResult]);

  useEffect(() => {
    const filters = { ...EMPTY_ORDER_FILTERS };
    const cursors = [null];
    const version = ++requestVersion.current;
    void fetchAdminOrders(filters, null).then((result) => {
      acceptPageResult(result, filters, cursors, version);
    });
    return () => { requestVersion.current += 1; };
  }, [acceptPageResult]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadPage({ ...draftFilters }, [null]);
  }

  function resetFilters() {
    const empty = { ...EMPTY_ORDER_FILTERS };
    setDraftFilters(empty);
    void loadPage(empty, [null]);
  }

  function nextPage() {
    if (!page.nextCursor || loading) return;
    void loadPage(appliedFilters, [...cursorStack, page.nextCursor]);
  }

  function previousPage() {
    if (cursorStack.length <= 1 || loading) return;
    void loadPage(appliedFilters, cursorStack.slice(0, -1));
  }

  return (
    <section aria-labelledby="orders-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">Order management</p>
          <h1 id="orders-heading" className="mt-2 text-3xl font-semibold text-ink">Orders</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">Search and review orders, then progress paid orders through their fulfilment workflow.</p>
        </div>
        <p className="text-xs font-medium text-ink/55">Newest orders first</p>
      </div>

      <form onSubmit={submitFilters} className="mt-8 rounded-2xl border border-ink/10 bg-paper/60 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,2fr)_repeat(3,minmax(9rem,1fr))]">
          <label className="text-sm font-semibold text-ink">
            Search orders
            <input type="search" value={draftFilters.search} maxLength={200} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Order number, name or email" className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3 py-2 font-normal text-ink outline-none placeholder:text-ink/40 focus:border-forest focus:ring-2 focus:ring-forest/20" />
          </label>
          <label className="text-sm font-semibold text-ink">
            Order status
            <select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as OrderFilters["status"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3 py-2 font-normal text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20">
              <option value="">All statuses</option>
              {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">
            Payment status
            <select value={draftFilters.paymentStatus} onChange={(event) => setDraftFilters((current) => ({ ...current, paymentStatus: event.target.value as OrderFilters["paymentStatus"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3 py-2 font-normal text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20">
              <option value="">All payments</option>
              {PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">
            Fulfilment
            <select value={draftFilters.fulfilmentType} onChange={(event) => setDraftFilters((current) => ({ ...current, fulfilmentType: event.target.value as OrderFilters["fulfilmentType"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-ink/20 bg-white px-3 py-2 font-normal text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20">
              <option value="">Delivery and pickup</option>
              {FULFILMENT_TYPES.map((type) => <option key={type} value={type}>{type === "PICKUP" ? "Pickup" : "Delivery"}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" disabled={loading} className="min-h-11 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60">{loading ? "Loading..." : "Apply filters"}</button>
          <button type="button" onClick={resetFilters} disabled={loading} className="min-h-11 rounded-xl border border-ink/20 bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60">Reset</button>
        </div>
      </form>

      <div className="mt-8" aria-live="polite" aria-busy={loading}>
        {loading ? <div role="status" className="rounded-2xl border border-ink/10 bg-paper/50 px-6 py-12 text-center text-sm text-ink/65">Loading orders...</div> : null}
        {!loading && access ? (
          <div role="alert" className="rounded-2xl border border-amber-700/20 bg-amber-50 p-5 text-sm text-amber-950">
            <p>{accessMessage(access)}</p>
            <Link href="/admin/login" prefetch={false} className="mt-3 inline-flex font-semibold underline underline-offset-4">Go to admin sign in</Link>
          </div>
        ) : null}
        {!loading && error ? (
          <div role="alert" className="rounded-2xl border border-red-700/20 bg-red-50 p-5 text-sm text-red-900">
            <p>{error}</p>
            <button type="button" onClick={() => { void loadPage(appliedFilters, cursorStack); }} className="mt-3 font-semibold underline underline-offset-4">Try again</button>
          </div>
        ) : null}
        {!loading && !access && !error ? <AdminOrdersResults orders={page.orders} /> : null}
      </div>

      {!loading && !access && !error && page.orders.length > 0 ? (
        <nav aria-label="Orders pagination" className="mt-6 flex items-center justify-between gap-4 border-t border-ink/10 pt-5">
          <button type="button" onClick={previousPage} disabled={cursorStack.length <= 1 || loading} className="min-h-11 rounded-xl border border-ink/20 px-4 py-2 text-sm font-semibold text-ink hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
          <p className="text-sm text-ink/60">Page {cursorStack.length}</p>
          <button type="button" onClick={nextPage} disabled={!page.nextCursor || loading} className="min-h-11 rounded-xl border border-ink/20 px-4 py-2 text-sm font-semibold text-ink hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40">Next</button>
        </nav>
      ) : null}
    </section>
  );
}
