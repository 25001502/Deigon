"use client";

/* eslint-disable @next/next/no-img-element -- order snapshots may contain historical external image URLs. */

import {
  Check,
  Circle,
  CreditCard,
  MapPin,
  Package,
  RotateCw,
  Store,
  Truck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { fetchCustomerOrder, type CustomerOrderResult } from "./order-api";
import {
  customerTimeline,
  formatCalendarDate,
  formatDateTime,
  formatMoney,
  orderStatusLabel,
  paymentStatusLabel,
  safeImageSource,
  type CustomerOrderDetail,
} from "./order-ui";

function Section({ title, icon: Icon, children, className = "" }: {
  title: string;
  icon: typeof Package;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-200/80 bg-white p-5 shadow-[0_12px_32px_rgba(17,24,39,0.04)] sm:p-6 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-black">
          <Icon aria-hidden="true" className="h-4.5 w-4.5" strokeWidth={1.7} />
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-900">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Definition({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</dt>
      <dd className="mt-1.5 break-words text-sm font-medium text-gray-950">{children}</dd>
    </div>
  );
}

function badgeClass(status: string) {
  if (status === "PAID" || status === "DELIVERED") return "bg-emerald-50 text-emerald-800 ring-emerald-700/15";
  if (status === "FAILED" || status === "REFUNDED" || status === "CANCELLED") return "bg-red-50 text-red-800 ring-red-700/15";
  if (status === "PENDING") return "bg-amber-50 text-amber-900 ring-amber-700/15";
  return "bg-sky-50 text-sky-800 ring-sky-700/15";
}

function Badge({ status, children }: { status: string; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${badgeClass(status)}`}>
      {children}
    </span>
  );
}

export function CustomerOrderDetailContent({ order }: { order: CustomerOrderDetail }) {
  const shippingAddress = [
    order.shippingAddressLine1,
    order.shippingAddressLine2,
    order.shippingCity,
    order.shippingProvince,
    order.shippingPostalCode,
    order.shippingCountry,
  ].filter(Boolean);
  const timeline = customerTimeline(order);

  return (
    <article>
      <Link href="/account#orders" className="inline-flex text-sm font-semibold text-black underline decoration-gray-300 underline-offset-4 hover:decoration-black">
        ← Back to order history
      </Link>

      <header className="mt-5 flex flex-col gap-5 border-b border-gray-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            {order.fulfilmentType === "PICKUP" ? "Pickup order" : "Delivery order"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-950 sm:text-3xl">{order.orderNumber}</h1>
          <p className="mt-2 text-sm text-gray-500">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge status={order.paymentStatus}>Payment: {paymentStatusLabel(order.paymentStatus)}</Badge>
          <Badge status={order.status}>{orderStatusLabel(order.fulfilmentType, order.status)}</Badge>
        </div>
      </header>

      {order.status === "CANCELLED" ? (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
          <p className="font-semibold">This order was cancelled.</p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Section title="Order summary" icon={Package}>
          <dl className="grid gap-5 sm:grid-cols-2">
            <Definition label="Order number">{order.orderNumber}</Definition>
            <Definition label="Order status">{orderStatusLabel(order.fulfilmentType, order.status)}</Definition>
            <Definition label="Payment status">{paymentStatusLabel(order.paymentStatus)}</Definition>
            <Definition label="Fulfilment">{order.fulfilmentType === "PICKUP" ? "Pickup" : "Delivery"}</Definition>
            <Definition label="Subtotal">{formatMoney(order.subtotal)}</Definition>
            <Definition label="Shipping">{formatMoney(order.shippingFee)}</Definition>
            <Definition label="Total">{formatMoney(order.total)}</Definition>
          </dl>
        </Section>

        <Section title="Customer details at checkout" icon={UserRound}>
          <p className="mb-5 text-xs leading-5 text-gray-500">These details are the snapshot saved when you placed the order.</p>
          <dl className="grid gap-5 sm:grid-cols-2">
            <Definition label="Name">{order.customerName}</Definition>
            <Definition label="Email">{order.customerEmail}</Definition>
            <Definition label="Phone">{order.customerPhone || "Not provided"}</Definition>
          </dl>
        </Section>

        <Section
          title={order.fulfilmentType === "DELIVERY" ? "Delivery details" : "Collection details"}
          icon={order.fulfilmentType === "DELIVERY" ? Truck : Store}
        >
          {order.fulfilmentType === "DELIVERY" ? (
            <>
              <address className="text-sm not-italic leading-7 text-gray-700">
                {shippingAddress.length > 0
                  ? shippingAddress.map((part, index) => <span key={`${index}-${part}`} className="block">{part}</span>)
                  : "No delivery address is available for this order."}
              </address>
              <div className="mt-5 border-t border-gray-100 pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Estimated delivery</p>
                <p className="mt-1.5 text-sm font-medium text-gray-950">{formatCalendarDate(order.estimatedDeliveryDate)}</p>
                {!order.estimatedDeliveryDate ? <p className="mt-1 text-xs text-gray-500">We will show an estimate here when one is available.</p> : null}
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3 text-sm leading-6 text-gray-700">
              <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
              <p>{order.pickupLocation || "Pickup location unavailable"}</p>
            </div>
          )}
        </Section>

        <Section title="Payment" icon={CreditCard}>
          <dl className="grid gap-5 sm:grid-cols-2">
            <Definition label="Payment status">{paymentStatusLabel(order.paymentStatus)}</Definition>
            <Definition label="Order total">{formatMoney(order.total)}</Definition>
          </dl>
          <p className="mt-5 rounded-lg bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-600">
            Payment status is shown for reference and updates from the payment confirmation system.
          </p>
        </Section>
      </div>

      <Section title="Items" icon={Package} className="mt-5">
        {order.items.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {order.items.map((item, index) => {
              const image = safeImageSource(item.imageUrl);
              return (
                <article key={`${item.sku}-${index}`} className="grid gap-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
                  <div className="h-20 w-20 overflow-hidden rounded-lg bg-gray-100">
                    {image
                      ? <img src={image} alt={`${item.title} snapshot`} className="h-full w-full object-cover" />
                      : <div className="flex h-full items-center justify-center px-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400">No image</div>}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-950">{item.title}</h3>
                    <p className="mt-1 text-sm text-gray-500">SKU {item.sku}</p>
                    <p className="mt-1 text-sm text-gray-500">{[item.size, item.color].filter(Boolean).join(" / ") || "No variant options"}</p>
                    <p className="mt-1 text-sm text-gray-500">{item.quantity} × {formatMoney(item.unitPrice)}</p>
                  </div>
                  <p className="font-semibold text-gray-950 sm:text-right">{formatMoney(item.lineTotal)}</p>
                </article>
              );
            })}
          </div>
        ) : <p className="text-sm text-gray-500">No item snapshots are available for this order.</p>}
      </Section>

      <Section title="Order tracking" icon={Truck} className="mt-5">
        <ol className="space-y-0">
          {timeline.map((entry, index) => (
            <li key={entry.label} className="relative flex gap-4 pb-6 last:pb-0">
              {index < timeline.length - 1 ? (
                <span aria-hidden="true" className={`absolute left-[0.6875rem] top-6 h-[calc(100%-1.25rem)] w-px ${entry.state === "complete" ? "bg-emerald-500" : "bg-gray-200"}`} />
              ) : null}
              <span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${entry.state === "future" ? "bg-gray-100 text-gray-400" : entry.state === "current" ? "bg-black text-white" : "bg-emerald-100 text-emerald-800"}`}>
                {entry.state === "complete" ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Circle aria-hidden="true" className="h-2.5 w-2.5 fill-current" />}
              </span>
              <div>
                <p className={`text-sm font-semibold ${entry.state === "future" ? "text-gray-400" : "text-gray-950"}`}>{entry.label}</p>
                <p className="mt-1 text-xs text-gray-500">{entry.value}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </article>
  );
}

function failureMessage(result: Exclude<CustomerOrderResult, { kind: "ok" }>) {
  if (result.kind === "not-found") return "This order could not be found.";
  return "We could not load this order. Please try again.";
}

export function CustomerOrderDetailView({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessExpired, setAccessExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const applyResult = useCallback((result: CustomerOrderResult) => {
    setLoading(false);
    if (result.kind === "ok") {
      setOrder(result.data);
      setAccessExpired(false);
      setError(null);
    } else if (result.kind === "unauthenticated") {
      setOrder(null);
      setAccessExpired(true);
      setError(null);
    } else {
      setOrder(null);
      setAccessExpired(false);
      setError(failureMessage(result));
    }
  }, []);

  const loadOrder = useCallback(() => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    void fetchCustomerOrder(orderId).then((result) => {
      if (version === requestVersion.current) applyResult(result);
    });
  }, [applyResult, orderId]);

  useEffect(() => {
    const version = ++requestVersion.current;
    void fetchCustomerOrder(orderId).then((result) => {
      if (version === requestVersion.current) applyResult(result);
    });
    return () => { requestVersion.current += 1; };
  }, [applyResult, orderId]);

  if (loading) {
    return <p role="status" className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center text-sm text-gray-500">Loading order details…</p>;
  }

  if (accessExpired) {
    return (
      <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <p>Your session has expired. Sign in again to view your order.</p>
        <Link href="/login" className="mt-3 inline-flex font-semibold underline underline-offset-4">Go to sign in</Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        <p>{error ?? "We could not load this order."}</p>
        <button type="button" onClick={loadOrder} className="mt-3 inline-flex items-center gap-2 font-semibold underline underline-offset-4">
          <RotateCw aria-hidden="true" className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  return <CustomerOrderDetailContent order={order} />;
}
