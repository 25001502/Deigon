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
  if (status === "PAID" || status === "DELIVERED") return "border border-solid border-neutral-500 bg-neutral-200 text-neutral-950";
  if (status === "FAILED" || status === "CANCELLED" || status === "REFUNDED") return "border border-double border-neutral-600 bg-neutral-100 text-neutral-950";
  if (status === "PENDING") return "border border-dashed border-neutral-500 bg-white text-neutral-900";
  return "border border-solid border-neutral-400 bg-neutral-50 text-neutral-900";
}

function StatusBadge({ children, status }: { children: string; status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusTone(status)}`}>{children}</span>;
}

export function AdminOrdersResults({ orders }: { orders: AdminOrderListItem[] }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/50 px-6 py-12 text-center">
        <h2 className="text-lg font-semibold text-neutral-900">No orders found</h2>
        <p className="mt-2 text-sm text-neutral-600">Try changing the submitted search or filters.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:hidden">
        {orders.map((order) => (
          <article key={order.id} className="rounded-2xl border border-neutral-300 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-900">{order.fulfilmentType}</p>
                <h2 className="mt-1 font-semibold text-neutral-900">{order.orderNumber}</h2>
                <p className="mt-1 text-sm text-neutral-600">{formatDateTime(order.createdAt)}</p>
              </div>
              <p className="font-semibold text-neutral-900">{formatMoney(order.total)}</p>
            </div>
            <div className="mt-4">
              <p className="font-medium text-neutral-900">{order.customerName}</p>
              <p className="break-all text-sm text-neutral-600">{order.customerEmail}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge status={order.paymentStatus}>{paymentStatusLabel(order.paymentStatus)}</StatusBadge>
              <StatusBadge status={order.status}>{orderStatusLabel(order.fulfilmentType, order.status)}</StatusBadge>
            </div>
            <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} prefetch={false} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">View order</Link>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-neutral-300 lg:block">
        <table className="min-w-full divide-y divide-neutral-300 text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-600">
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
          <tbody className="divide-y divide-neutral-300 bg-white">
            {orders.map((order) => (
              <tr key={order.id} className="align-top hover:bg-neutral-50/50">
                <td className="whitespace-nowrap px-4 py-4">
                  <p className="font-semibold text-neutral-900">{order.orderNumber}</p>
                  <p className="mt-1 text-xs text-neutral-600">{formatDateTime(order.createdAt)}</p>
                </td>
                <td className="max-w-56 px-4 py-4">
                  <p className="font-medium text-neutral-900">{order.customerName}</p>
                  <p className="mt-1 truncate text-xs text-neutral-600">{order.customerEmail}</p>
                </td>
                <td className="px-4 py-4 text-neutral-600">{order.fulfilmentType === "PICKUP" ? "Pickup" : "Delivery"}</td>
                <td className="px-4 py-4"><StatusBadge status={order.paymentStatus}>{paymentStatusLabel(order.paymentStatus)}</StatusBadge></td>
                <td className="px-4 py-4"><StatusBadge status={order.status}>{orderStatusLabel(order.fulfilmentType, order.status)}</StatusBadge></td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-neutral-900">{formatMoney(order.total)}</td>
                <td className="px-4 py-4 text-right">
                  <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} prefetch={false} aria-label={`View order ${order.orderNumber}`} className="rounded-lg px-3 py-2 font-semibold text-neutral-900 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">View</Link>
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
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-900">Order management</p>
          <h1 id="orders-heading" className="mt-2 text-3xl font-semibold text-neutral-900">Orders</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">Search and review orders, then progress paid orders through their fulfilment workflow.</p>
        </div>
        <p className="text-xs font-medium text-neutral-600">Newest orders first</p>
      </div>

      <form onSubmit={submitFilters} className="mt-8 rounded-2xl border border-neutral-300 bg-neutral-50/60 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,2fr)_repeat(3,minmax(9rem,1fr))]">
          <label className="text-sm font-semibold text-neutral-900">
            Search orders
            <input type="search" value={draftFilters.search} maxLength={200} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Order number, name or email" className="mt-2 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 font-normal text-neutral-900 outline-none placeholder:text-neutral-600 focus:border-neutral-600 focus:ring-2 focus:ring-neutral-500" />
          </label>
          <label className="text-sm font-semibold text-neutral-900">
            Order status
            <select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as OrderFilters["status"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 font-normal text-neutral-900 outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-500">
              <option value="">All statuses</option>
              {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-neutral-900">
            Payment status
            <select value={draftFilters.paymentStatus} onChange={(event) => setDraftFilters((current) => ({ ...current, paymentStatus: event.target.value as OrderFilters["paymentStatus"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 font-normal text-neutral-900 outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-500">
              <option value="">All payments</option>
              {PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-neutral-900">
            Fulfilment
            <select value={draftFilters.fulfilmentType} onChange={(event) => setDraftFilters((current) => ({ ...current, fulfilmentType: event.target.value as OrderFilters["fulfilmentType"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 font-normal text-neutral-900 outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-500">
              <option value="">Delivery and pickup</option>
              {FULFILMENT_TYPES.map((type) => <option key={type} value={type}>{type === "PICKUP" ? "Pickup" : "Delivery"}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" disabled={loading} className="min-h-11 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait disabled:opacity-60">{loading ? "Loading..." : "Apply filters"}</button>
          <button type="button" onClick={resetFilters} disabled={loading} className="min-h-11 rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait disabled:opacity-60">Reset</button>
        </div>
      </form>

      <div className="mt-8" aria-live="polite" aria-busy={loading}>
        {loading ? <div role="status" className="rounded-2xl border border-neutral-300 bg-neutral-50/50 px-6 py-12 text-center text-sm text-neutral-600">Loading orders...</div> : null}
        {!loading && access ? (
          <div role="alert" className="rounded-2xl border border-neutral-500/20 bg-neutral-50 p-5 text-sm text-neutral-900">
            <p>{accessMessage(access)}</p>
            <Link href="/admin/login" prefetch={false} className="mt-3 inline-flex font-semibold underline underline-offset-4">Go to admin sign in</Link>
          </div>
        ) : null}
        {!loading && error ? (
          <div role="alert" className="rounded-2xl border border-neutral-500/20 bg-neutral-100 p-5 text-sm text-neutral-900">
            <p>{error}</p>
            <button type="button" onClick={() => { void loadPage(appliedFilters, cursorStack); }} className="mt-3 font-semibold underline underline-offset-4">Try again</button>
          </div>
        ) : null}
        {!loading && !access && !error ? <AdminOrdersResults orders={page.orders} /> : null}
      </div>

      {!loading && !access && !error && page.orders.length > 0 ? (
        <nav aria-label="Orders pagination" className="mt-6 flex items-center justify-between gap-4 border-t border-neutral-300 pt-5">
          <button type="button" onClick={previousPage} disabled={cursorStack.length <= 1 || loading} className="min-h-11 rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
          <p className="text-sm text-neutral-600">Page {cursorStack.length}</p>
          <button type="button" onClick={nextPage} disabled={!page.nextCursor || loading} className="min-h-11 rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
        </nav>
      ) : null}
    </section>
  );
}
