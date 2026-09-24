export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "CANCELLED",
] as const;

export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export const FULFILMENT_TYPES = ["DELIVERY", "PICKUP"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

export type CustomerOrderDetail = {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfilmentType: FulfilmentType;
  subtotal: string;
  shippingFee: string;
  total: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  pickupLocation: string | null;
  createdAt: string;
  confirmedAt: string | null;
  processingAt: string | null;
  shippedAt: string | null;
  readyForPickupAt: string | null;
  deliveredAt: string | null;
  estimatedDeliveryDate: string | null;
  cancelledAt: string | null;
  items: Array<{
    title: string;
    sku: string;
    size: string | null;
    color: string | null;
    imageUrl: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
};

export function orderStatusLabel(type: FulfilmentType, status: OrderStatus): string {
  if (status === "READY_FOR_PICKUP") return "Ready for collection";
  if (status === "SHIPPED") return "Out for delivery";
  if (status === "DELIVERED" && type === "PICKUP") return "Collected";
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function formatMoney(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Unavailable";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateTime(value: string | null): string {
  if (!value) return "Timestamp unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatCalendarDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not available yet";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return "Not available yet";
  return new Intl.DateTimeFormat("en-ZA", { timeZone: "UTC", dateStyle: "long" }).format(date);
}

export function safeImageSource(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export type TimelineEntry = {
  label: string;
  value: string;
  state: "complete" | "current" | "future";
};

export function customerTimeline(order: CustomerOrderDetail): TimelineEntry[] {
  const stages = order.fulfilmentType === "DELIVERY"
    ? [
        { status: "CONFIRMED" as const, label: "Confirmed", timestamp: order.confirmedAt },
        { status: "PROCESSING" as const, label: "Processing", timestamp: order.processingAt },
        { status: "SHIPPED" as const, label: "Out for delivery", timestamp: order.shippedAt },
        { status: "DELIVERED" as const, label: "Delivered", timestamp: order.deliveredAt },
      ]
    : [
        { status: "CONFIRMED" as const, label: "Confirmed", timestamp: order.confirmedAt },
        { status: "PROCESSING" as const, label: "Processing", timestamp: order.processingAt },
        { status: "READY_FOR_PICKUP" as const, label: "Ready for collection", timestamp: order.readyForPickupAt },
        { status: "DELIVERED" as const, label: "Collected", timestamp: order.deliveredAt },
      ];

  const currentIndex = stages.findIndex((stage) => stage.status === order.status);
  const entries: TimelineEntry[] = [{
    label: "Order placed",
    value: formatDateTime(order.createdAt),
    state: order.status === "PENDING" ? "current" : "complete",
  }];

  for (const [index, stage] of stages.entries()) {
    const reached = order.status === "CANCELLED" ? Boolean(stage.timestamp) : currentIndex >= index;
    entries.push({
      label: stage.label,
      value: reached ? formatDateTime(stage.timestamp) : "Not reached",
      state: reached ? (order.status === stage.status ? "current" : "complete") : "future",
    });
  }

  if (order.status === "CANCELLED") {
    entries.push({
      label: "Cancelled",
      value: formatDateTime(order.cancelledAt),
      state: "current",
    });
  }

  return entries;
}
