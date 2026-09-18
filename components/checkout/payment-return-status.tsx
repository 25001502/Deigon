"use client";

import { CircleAlert, CircleCheck, Clock3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export type PaymentReturnKind = "success" | "cancel" | "failure";

export type PaymentStatusSnapshot = {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    fulfilmentType: string;
    total: string;
    confirmedAt: string | null;
  };
  payment: {
    provider: string;
    status: string;
  };
};

export const PAYMENT_POLL_INTERVAL_MS = 1_800;
export const PAYMENT_POLL_MAX_ATTEMPTS = 10;
export const PAYMENT_POLL_DEADLINE_MS = 18_000;

const PAID_ORDER_STATUSES = new Set([
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "READY_FOR_PICKUP",
  "DELIVERED",
]);

type PaymentState = "paid" | "pending" | "inconsistent";

type PollingResult = {
  snapshot: PaymentStatusSnapshot | null;
  state: PaymentState | "unavailable" | "aborted";
  timedOut: boolean;
};

type PollingOptions = {
  kind: PaymentReturnKind;
  orderId: string;
  signal: AbortSignal;
  request?: (
    orderId: string,
    signal: AbortSignal,
  ) => Promise<PaymentStatusSnapshot | null>;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  scheduleDeadline?: (
    callback: () => void,
    milliseconds: number,
  ) => () => void;
  maxAttempts?: number;
  deadlineMs?: number;
  onSnapshot?: (snapshot: PaymentStatusSnapshot) => void;
};

type PaymentStatusViewProps = {
  kind: PaymentReturnKind;
  snapshot: PaymentStatusSnapshot | null;
  loading?: boolean;
  unavailable?: boolean;
  timedOut?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePaymentStatus(value: unknown): PaymentStatusSnapshot | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.order) || !isRecord(value.payment)) {
    return null;
  }

  const { order, payment } = value;
  const requiredOrderFields = [
    "id",
    "orderNumber",
    "status",
    "paymentStatus",
    "fulfilmentType",
    "total",
  ] as const;

  if (
    requiredOrderFields.some((field) => typeof order[field] !== "string") ||
    (order.confirmedAt !== null && typeof order.confirmedAt !== "string") ||
    typeof payment.provider !== "string" ||
    typeof payment.status !== "string"
  ) {
    return null;
  }

  return {
    order: {
      id: order.id as string,
      orderNumber: order.orderNumber as string,
      status: order.status as string,
      paymentStatus: order.paymentStatus as string,
      fulfilmentType: order.fulfilmentType as string,
      total: order.total as string,
      confirmedAt: order.confirmedAt as string | null,
    },
    payment: {
      provider: payment.provider,
      status: payment.status,
    },
  };
}

export function isValidPaymentReturnOrderId(orderId: string | null) {
  return orderId !== null && /^[A-Za-z0-9_-]{10,128}$/.test(orderId);
}

export function classifyPaymentStatus(snapshot: PaymentStatusSnapshot): PaymentState {
  if (
    snapshot.payment.status === "PAID" &&
    snapshot.order.paymentStatus === "PAID" &&
    PAID_ORDER_STATUSES.has(snapshot.order.status)
  ) {
    return "paid";
  }

  if (
    snapshot.payment.status === "PENDING" &&
    snapshot.order.paymentStatus === "PENDING"
  ) {
    return "pending";
  }

  return "inconsistent";
}

export async function fetchPaymentStatus(
  orderId: string,
  signal: AbortSignal,
): Promise<PaymentStatusSnapshot | null> {
  const response = await fetch(
    `/api/orders/${encodeURIComponent(orderId)}/payment-status`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    },
  );

  if (!response.ok) return null;
  return parsePaymentStatus(await response.json().catch(() => null));
}

function waitForPoll(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);

    function handleAbort() {
      window.clearTimeout(timeout);
      reject(new DOMException("Polling aborted", "AbortError"));
    }

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function schedulePollingDeadline(callback: () => void, milliseconds: number) {
  const timeout = globalThis.setTimeout(callback, milliseconds);
  return () => globalThis.clearTimeout(timeout);
}

export async function pollPaymentStatus({
  kind,
  orderId,
  signal,
  request = fetchPaymentStatus,
  wait = waitForPoll,
  scheduleDeadline = schedulePollingDeadline,
  maxAttempts = PAYMENT_POLL_MAX_ATTEMPTS,
  deadlineMs = PAYMENT_POLL_DEADLINE_MS,
  onSnapshot,
}: PollingOptions): Promise<PollingResult> {
  let snapshot: PaymentStatusSnapshot | null = null;
  let terminationReason: "deadline" | "unmount" | null = null;
  const requestController = new AbortController();
  const terminated = Symbol("payment polling terminated");
  let resolveTermination: (value: typeof terminated) => void = () => {};
  const termination = new Promise<typeof terminated>((resolve) => {
    resolveTermination = resolve;
  });

  const finishTermination = (): PollingResult => {
    if (terminationReason === "deadline") {
      return snapshot
        ? { snapshot, state: "pending", timedOut: true }
        : { snapshot: null, state: "unavailable", timedOut: false };
    }

    return { snapshot, state: "aborted", timedOut: false };
  };

  const terminate = (reason: "deadline" | "unmount") => {
    if (terminationReason) return;
    terminationReason = reason;
    resolveTermination(terminated);
    requestController.abort();
  };

  if (signal.aborted) {
    return { snapshot: null, state: "aborted", timedOut: false };
  }

  const handleUnmount = () => terminate("unmount");
  signal.addEventListener("abort", handleUnmount, { once: true });
  const cancelDeadline = scheduleDeadline(
    () => terminate("deadline"),
    deadlineMs,
  );

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (terminationReason) return finishTermination();

      if (attempt > 0) {
        const waitResult = await Promise.race([
          wait(PAYMENT_POLL_INTERVAL_MS, requestController.signal),
          termination,
        ]);
        if (waitResult === terminated) return finishTermination();
      }

      const nextSnapshot = await Promise.race([
        request(orderId, requestController.signal),
        termination,
      ]);
      if (nextSnapshot === terminated) return finishTermination();
      if (!nextSnapshot) {
        return snapshot
          ? { snapshot, state: "pending", timedOut: true }
          : { snapshot: null, state: "unavailable", timedOut: false };
      }

      snapshot = nextSnapshot;
      onSnapshot?.(snapshot);

      const state = classifyPaymentStatus(snapshot);
      if (state !== "pending" || kind !== "success") {
        return { snapshot, state, timedOut: false };
      }
    }

    return { snapshot, state: "pending", timedOut: true };
  } catch {
    if (terminationReason) return finishTermination();

    return snapshot
      ? { snapshot, state: "pending", timedOut: true }
      : { snapshot: null, state: "unavailable", timedOut: false };
  } finally {
    cancelDeadline();
    signal.removeEventListener("abort", handleUnmount);
  }
}

function humanizeStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function OrderSummary({ snapshot }: { snapshot: PaymentStatusSnapshot }) {
  return (
    <dl className="mt-8 grid w-full grid-cols-2 gap-x-6 gap-y-4 border-y border-gray-200 py-6 text-left text-sm">
      <div>
        <dt className="text-gray-500">Order</dt>
        <dd className="mt-1 font-medium text-gray-950">{snapshot.order.orderNumber}</dd>
      </div>
      <div>
        <dt className="text-gray-500">Total</dt>
        <dd className="mt-1 font-medium text-gray-950">R {snapshot.order.total}</dd>
      </div>
      <div>
        <dt className="text-gray-500">Order status</dt>
        <dd className="mt-1 font-medium text-gray-950">
          {humanizeStatus(snapshot.order.status)}
        </dd>
      </div>
      <div>
        <dt className="text-gray-500">Fulfilment</dt>
        <dd className="mt-1 font-medium text-gray-950">
          {humanizeStatus(snapshot.order.fulfilmentType)}
        </dd>
      </div>
    </dl>
  );
}

export function PaymentStatusView({
  kind,
  snapshot,
  loading = false,
  unavailable = false,
  timedOut = false,
}: PaymentStatusViewProps) {
  const state = snapshot ? classifyPaymentStatus(snapshot) : null;

  if (loading) {
    return (
      <PaymentStatusShell icon={<Clock3 aria-hidden="true" className="h-7 w-7" />} title="Checking payment status">
        <p className="mt-6 max-w-md text-sm leading-7 text-gray-600">
          We&apos;re checking the latest status of your order.
        </p>
      </PaymentStatusShell>
    );
  }

  if (unavailable || !snapshot || state === "inconsistent") {
    return (
      <PaymentStatusShell icon={<CircleAlert aria-hidden="true" className="h-7 w-7" />} title="We couldn't verify the current payment state">
        <p className="mt-6 max-w-md text-sm leading-7 text-gray-600">
          Please check your orders for the latest status.
        </p>
      </PaymentStatusShell>
    );
  }

  if (state === "paid") {
    return (
      <PaymentStatusShell icon={<CircleCheck aria-hidden="true" className="h-7 w-7" />} title="Payment confirmed">
        <p className="mt-6 max-w-md text-sm leading-7 text-gray-600">
          Your payment has been confirmed. Your latest order status is shown below.
        </p>
        <OrderSummary snapshot={snapshot} />
      </PaymentStatusShell>
    );
  }

  const title = timedOut
    ? "Payment verification is taking longer than expected."
    : kind === "success"
      ? "We're confirming your payment"
      : "Payment has not been confirmed";

  const message = kind === "success"
    ? "Your order is recorded while we wait for secure payment confirmation."
    : "Your order remains recorded. Check your orders for the latest payment status before trying again.";

  return (
    <PaymentStatusShell icon={<Clock3 aria-hidden="true" className="h-7 w-7" />} title={title}>
      <p className="mt-6 max-w-md text-sm leading-7 text-gray-600">{message}</p>
      <OrderSummary snapshot={snapshot} />
    </PaymentStatusShell>
  );
}

function PaymentStatusShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-950">
        {icon}
      </div>
      <h1 className="mt-6 text-3xl font-bold text-gray-900">{title}</h1>
      {children}
      <Link
        href="/account#orders"
        className="mt-8 inline-flex items-center justify-center rounded-full bg-black px-7 py-3.5 text-sm font-medium text-white transition hover:bg-neutral-800"
      >
        View your orders
      </Link>
    </main>
  );
}

export function PaymentReturnStatus({
  kind,
  orderId,
}: {
  kind: PaymentReturnKind;
  orderId: string | null;
}) {
  return (
    <PaymentReturnStatusLoader
      key={`${kind}:${orderId ?? "missing"}`}
      kind={kind}
      orderId={orderId}
    />
  );
}

function PaymentReturnStatusLoader({
  kind,
  orderId,
}: {
  kind: PaymentReturnKind;
  orderId: string | null;
}) {
  const validOrderId = isValidPaymentReturnOrderId(orderId);
  const [view, setView] = useState<{
    snapshot: PaymentStatusSnapshot | null;
    loading: boolean;
    unavailable: boolean;
    timedOut: boolean;
  }>({
    snapshot: null,
    loading: validOrderId,
    unavailable: !validOrderId,
    timedOut: false,
  });

  useEffect(() => {
    if (!validOrderId || !orderId) return;

    const controller = new AbortController();

    void pollPaymentStatus({
      kind,
      orderId,
      signal: controller.signal,
      onSnapshot: (snapshot) => {
        setView({ snapshot, loading: false, unavailable: false, timedOut: false });
      },
    }).then((result) => {
      if (controller.signal.aborted || result.state === "aborted") return;

      setView({
        snapshot: result.snapshot,
        loading: false,
        unavailable: result.state === "unavailable",
        timedOut: result.timedOut,
      });
    });

    return () => controller.abort();
  }, [kind, orderId, validOrderId]);

  return <PaymentStatusView kind={kind} {...view} />;
}
