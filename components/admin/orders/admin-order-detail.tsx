"use client";

/* eslint-disable @next/next/no-img-element -- historical snapshot URLs are not restricted to configured Next image hosts. */

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";

import {
  fetchAdminOrder,
  performOrderMutation,
  transitionAdminOrder,
  updateAdminOrderEstimate,
  type ApiResult,
  type MutationResolution,
} from "./order-api";
import {
  canEditEstimatedDelivery,
  formatCalendarDate,
  formatDateTime,
  formatMoney,
  johannesburgToday,
  nextFulfilmentAction,
  orderStatusLabel,
  paymentStatusLabel,
  safeImageSource,
  type AdminOrderDetail,
  type FulfilmentAction,
} from "./order-ui";

function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-neutral-300 bg-white p-5 sm:p-6 ${className}`}>
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Definition({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-neutral-600">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-neutral-900">{children}</dd>
    </div>
  );
}

function badgeTone(status: string): string {
  if (status === "PAID" || status === "DELIVERED") return "border border-solid border-neutral-500 bg-neutral-200 text-neutral-950";
  if (status === "FAILED" || status === "CANCELLED" || status === "REFUNDED") return "border border-double border-neutral-600 bg-neutral-100 text-neutral-950";
  if (status === "PENDING") return "border border-dashed border-neutral-500 bg-white text-neutral-900";
  return "border border-solid border-neutral-400 bg-neutral-50 text-neutral-900";
}

function Badge({ status, children }: { status: string; children: string }) {
  return <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${badgeTone(status)}`}>{children}</span>;
}

function timeline(order: AdminOrderDetail) {
  return [
    { label: "Order placed", value: order.createdAt },
    { label: "Confirmed", value: order.confirmedAt },
    { label: "Processing", value: order.processingAt },
    order.fulfilmentType === "DELIVERY"
      ? { label: "Out for delivery / Shipped", value: order.shippedAt }
      : { label: "Ready for collection", value: order.readyForPickupAt },
    { label: order.fulfilmentType === "PICKUP" ? "Collected" : "Delivered", value: order.deliveredAt },
    ...(order.cancelledAt ? [{ label: "Cancelled", value: order.cancelledAt }] : []),
  ];
}

function EstimatedDeliveryEditor({
  order,
  pending,
  onSave,
}: {
  order: AdminOrderDetail;
  pending: boolean;
  onSave: (value: string | null) => void;
}) {
  const [value, setValue] = useState(order.estimatedDeliveryDate ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(value || null);
  }

  return (
    <form onSubmit={submit}>
      <label className="block text-sm font-semibold text-neutral-900">
        Estimated delivery date
        <input type="date" min={johannesburgToday()} value={value} onChange={(event) => setValue(event.target.value)} disabled={pending} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 font-normal text-neutral-900 outline-none focus:border-neutral-600 focus:ring-2 focus:ring-neutral-500 disabled:opacity-60 sm:max-w-xs" />
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={pending || value === (order.estimatedDeliveryDate ?? "")} className="min-h-11 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-not-allowed disabled:opacity-45">{pending ? "Saving..." : "Save date"}</button>
        {order.estimatedDeliveryDate ? (
          <button type="button" onClick={() => onSave(null)} disabled={pending} className="min-h-11 rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait disabled:opacity-50">Clear date</button>
        ) : null}
      </div>
    </form>
  );
}

export function AdminOrderDetailContent({
  order,
  pendingAction,
  notice,
  noticeTone = "success",
  error,
  onTransition,
  onEstimate,
}: {
  order: AdminOrderDetail;
  pendingAction: "fulfilment" | "estimate" | null;
  notice: string | null;
  noticeTone?: "success" | "warning";
  error: string | null;
  onTransition: (action: FulfilmentAction) => void;
  onEstimate: (value: string | null) => void;
}) {
  const action = nextFulfilmentAction(order);
  const etaEditable = canEditEstimatedDelivery(order);
  const shippingAddress = [
    order.shippingAddressLine1,
    order.shippingAddressLine2,
    order.shippingCity,
    order.shippingProvince,
    order.shippingPostalCode,
    order.shippingCountry,
  ].filter(Boolean);

  return (
    <article>
      <Link href="/admin/orders" prefetch={false} className="inline-flex rounded text-sm font-semibold text-neutral-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950">← Back to orders</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5 border-b border-neutral-300 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-900">{order.fulfilmentType === "PICKUP" ? "Pickup order" : "Delivery order"}</p>
          <h1 className="mt-2 text-3xl font-semibold text-neutral-900">{order.orderNumber}</h1>
          <p className="mt-2 text-sm text-neutral-600">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge status={order.paymentStatus}>{paymentStatusLabel(order.paymentStatus)}</Badge>
          <Badge status={order.status}>{orderStatusLabel(order.fulfilmentType, order.status)}</Badge>
        </div>
      </div>

      <div aria-live="polite" className="mt-5 space-y-3">
        {notice ? <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${noticeTone === "warning" ? "border-neutral-500/20 bg-neutral-50 text-neutral-900" : "border-neutral-500/20 bg-neutral-200 text-neutral-900"}`}>{notice}</p> : null}
        {error ? <p role="alert" className="rounded-xl border border-neutral-500/20 bg-neutral-100 px-4 py-3 text-sm text-neutral-900">{error}</p> : null}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Section title="Order information">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Definition label="Order number">{order.orderNumber}</Definition>
            <Definition label="Created">{formatDateTime(order.createdAt)}</Definition>
            <Definition label="Fulfilment">{order.fulfilmentType === "PICKUP" ? "Pickup" : "Delivery"}</Definition>
            <Definition label="Order status">{orderStatusLabel(order.fulfilmentType, order.status)}</Definition>
            <Definition label="Subtotal">{formatMoney(order.subtotal)}</Definition>
            <Definition label="Shipping">{formatMoney(order.shippingFee)}</Definition>
            <Definition label="Total">{formatMoney(order.total)}</Definition>
          </dl>
        </Section>

        <Section title="Customer snapshot">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Definition label="Name">{order.customerName}</Definition>
            <Definition label="Email">{order.customerEmail}</Definition>
            <Definition label="Phone">{order.customerPhone || "Not provided"}</Definition>
          </dl>
        </Section>

        <Section title="Payment snapshot">
          <div className="rounded-xl border border-neutral-500/20 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-900">Payment status is read-only here and remains controlled by the payment confirmation system.</div>
          <dl className="mt-5 grid gap-5 sm:grid-cols-3">
            <Definition label="Order payment">{paymentStatusLabel(order.paymentStatus)}</Definition>
            <Definition label="Provider payment">{order.payment ? paymentStatusLabel(order.payment.status) : "Not available"}</Definition>
            <Definition label="Paid amount">{order.payment ? formatMoney(order.payment.amount) : "Not available"}</Definition>
            {order.payment ? <Definition label="Provider">{order.payment.provider}</Definition> : null}
          </dl>
        </Section>

        <Section title={order.fulfilmentType === "DELIVERY" ? "Delivery snapshot" : "Pickup snapshot"}>
          {order.fulfilmentType === "DELIVERY" ? (
            <address className="text-sm not-italic leading-7 text-neutral-600">
              {shippingAddress.length > 0 ? shippingAddress.map((part, index) => <span key={`${index}-${part}`} className="block">{part}</span>) : "No delivery address recorded"}
            </address>
          ) : <p className="text-sm leading-6 text-neutral-600">{order.pickupLocation || "No pickup location recorded"}</p>}
        </Section>
      </div>

      <Section title="Items" className="mt-5">
        {order.items.length > 0 ? (
          <div className="divide-y divide-neutral-300">
            {order.items.map((item, index) => {
              const image = safeImageSource(item.imageUrl);
              return (
                <article key={`${item.sku}-${index}`} className="grid gap-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
                  <div className="h-20 w-20 overflow-hidden rounded-xl bg-neutral-50">
                    {image ? <img src={image} alt={`${item.title} snapshot`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-2 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-600">No image</div>}
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900">{item.title}</h3>
                    <p className="mt-1 text-sm text-neutral-600">SKU {item.sku}</p>
                    <p className="mt-1 text-sm text-neutral-600">{[item.size, item.color].filter(Boolean).join(" / ") || "No variant options"}</p>
                    <p className="mt-1 text-sm text-neutral-600">{item.quantity} × {formatMoney(item.unitPrice)}</p>
                  </div>
                  <p className="font-semibold text-neutral-900 sm:text-right">{formatMoney(item.lineTotal)}</p>
                </article>
              );
            })}
          </div>
        ) : <p className="text-sm text-neutral-600">No item snapshots are available for this order.</p>}
      </Section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Section title="Fulfilment timeline">
          <dl className="space-y-4">
            {timeline(order).map((entry) => (
              <div key={entry.label} className="flex items-start justify-between gap-4 border-b border-neutral-300 pb-3 last:border-0 last:pb-0">
                <dt className="text-sm font-medium text-neutral-900">{entry.label}</dt>
                <dd className="text-right text-sm text-neutral-600">{formatDateTime(entry.value)}</dd>
              </div>
            ))}
          </dl>
          {order.cancelReason ? <p className="mt-4 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-900"><span className="font-semibold">Cancellation note:</span> {order.cancelReason}</p> : null}
        </Section>

        <Section title="Fulfilment action">
          <p className="text-sm leading-6 text-neutral-600">Only the next valid step is available. Payment information cannot be changed from this page.</p>
          {action ? (
            <div className="mt-5">
              <p className="text-sm text-neutral-600">Next: {orderStatusLabel(order.fulfilmentType, action.targetStatus)}</p>
              <button type="button" onClick={() => onTransition(action)} disabled={pendingAction !== null} className="mt-3 min-h-11 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait disabled:opacity-55">{pendingAction === "fulfilment" ? "Updating..." : action.label}</button>
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-600">
              {order.status === "DELIVERED" || order.status === "CANCELLED"
                ? "This order is in a terminal state. No fulfilment actions are available."
                : order.status === "PENDING" || order.paymentStatus !== "PAID" || order.payment?.status !== "PAID"
                  ? "No fulfilment action is available until payment is authoritatively confirmed."
                  : "No fulfilment action is available for the current order state."}
            </p>
          )}
        </Section>
      </div>

      {order.fulfilmentType === "DELIVERY" ? (
        <Section title="Estimated delivery" className="mt-5">
          <p className="mb-4 text-sm text-neutral-600">Current estimate: <span className="font-semibold text-neutral-900">{formatCalendarDate(order.estimatedDeliveryDate)}</span></p>
          {etaEditable ? (
            <EstimatedDeliveryEditor key={`${order.id}:${order.status}:${order.estimatedDeliveryDate ?? "none"}`} order={order} pending={pendingAction !== null} onSave={onEstimate} />
          ) : <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600">The estimate is read-only in the current order state.</p>}
        </Section>
      ) : null}
    </article>
  );
}

function accessMessage(kind: "unauthenticated" | "forbidden") {
  return kind === "unauthenticated"
    ? "Your admin session has expired. Sign in again to continue."
    : "This account no longer has permission to view admin orders.";
}

export function AdminOrderDetailView({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<"unauthenticated" | "forbidden" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "warning">("success");
  const [pendingAction, setPendingAction] = useState<"fulfilment" | "estimate" | null>(null);
  const requestVersion = useRef(0);
  const submitting = useRef(false);

  const applyFailure = useCallback((result: Exclude<ApiResult<AdminOrderDetail>, { kind: "ok" }>) => {
    if (result.kind === "unauthenticated" || result.kind === "forbidden") {
      setAccess(result.kind);
      setError(null);
    } else if (result.kind === "not-found") {
      setError("This order could not be found.");
    } else if (result.kind === "invalid") {
      setError("The request was not accepted. Check the details and try again.");
    } else {
      setError("The order could not be loaded. Please try again.");
    }
  }, []);

  const loadOrder = useCallback(async (showLoading = true) => {
    const version = ++requestVersion.current;
    if (showLoading) setLoading(true);
    setError(null);
    const result = await fetchAdminOrder(orderId);
    if (version !== requestVersion.current) return;
    setLoading(false);
    if (result.kind === "ok") {
      setOrder(result.data);
      setAccess(null);
    } else {
      applyFailure(result);
    }
  }, [applyFailure, orderId]);

  useEffect(() => {
    const version = ++requestVersion.current;
    void fetchAdminOrder(orderId).then((result) => {
      if (version !== requestVersion.current) return;
      setLoading(false);
      if (result.kind === "ok") {
        setOrder(result.data);
        setAccess(null);
      } else {
        applyFailure(result);
      }
    });
    return () => { requestVersion.current += 1; };
  }, [applyFailure, orderId]);

  function handleResolution(resolution: MutationResolution<AdminOrderDetail>, successMessage: string) {
    if (resolution.kind === "updated") {
      setOrder(resolution.data);
      setNoticeTone("success");
      setNotice(resolution.refreshFailed ? `${successMessage} Refresh the page to confirm the latest details.` : successMessage);
      return;
    }
    if (resolution.kind === "conflict") {
      if (resolution.latest.kind === "ok") {
        setOrder(resolution.latest.data);
        setNoticeTone("warning");
        setNotice("This order changed before your update. The latest order details have been loaded; review them before trying again.");
      } else {
        setError("This order changed, but the latest details could not be loaded. Refresh the page before trying again.");
        if (resolution.latest.kind === "unauthenticated" || resolution.latest.kind === "forbidden") applyFailure(resolution.latest);
      }
      return;
    }
    applyFailure(resolution.result);
  }

  async function runMutation(kind: "fulfilment" | "estimate", mutate: () => Promise<ApiResult<AdminOrderDetail>>, successMessage: string) {
    if (submitting.current) return;
    submitting.current = true;
    setPendingAction(kind);
    setNotice(null);
    setError(null);
    try {
      const resolution = await performOrderMutation(mutate, () => fetchAdminOrder(orderId));
      handleResolution(resolution, successMessage);
    } finally {
      submitting.current = false;
      setPendingAction(null);
    }
  }

  function progressFulfilment(action: FulfilmentAction) {
    if (!order || pendingAction) return;
    const current = orderStatusLabel(order.fulfilmentType, order.status);
    const target = orderStatusLabel(order.fulfilmentType, action.targetStatus);
    if (!window.confirm(`Progress ${order.orderNumber} from ${current} to ${target}? This does not change payment status.`)) return;
    void runMutation(
      "fulfilment",
      () => transitionAdminOrder(order.id, order.status, action.targetStatus),
      `Order updated to ${target}.`,
    );
  }

  function saveEstimate(value: string | null) {
    if (!order || pendingAction) return;
    if (value === null && order.estimatedDeliveryDate && !window.confirm(`Clear the estimated delivery date for ${order.orderNumber}?`)) return;
    void runMutation(
      "estimate",
      () => updateAdminOrderEstimate(order, value),
      value ? "Estimated delivery date updated." : "Estimated delivery date cleared.",
    );
  }

  if (loading) return <p role="status" className="rounded-2xl border border-neutral-300 bg-neutral-50/50 px-6 py-12 text-center text-sm text-neutral-600">Loading order...</p>;
  if (access) {
    return (
      <div role="alert" className="rounded-2xl border border-neutral-500/20 bg-neutral-50 p-5 text-sm text-neutral-900">
        <p>{accessMessage(access)}</p>
        <Link href="/admin/login" prefetch={false} className="mt-3 inline-flex font-semibold underline underline-offset-4">Go to admin sign in</Link>
      </div>
    );
  }
  if (!order) {
    return (
      <div role="alert" className="rounded-2xl border border-neutral-500/20 bg-neutral-100 p-5 text-sm text-neutral-900">
        <p>{error ?? "The order could not be loaded."}</p>
        <button type="button" onClick={() => { void loadOrder(); }} className="mt-3 font-semibold underline underline-offset-4">Try again</button>
      </div>
    );
  }
  return <AdminOrderDetailContent order={order} pendingAction={pendingAction} notice={notice} noticeTone={noticeTone} error={error} onTransition={progressFulfilment} onEstimate={saveEstimate} />;
}
