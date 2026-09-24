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

export type AdminOrderListItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  total: string;
  paymentStatus: PaymentStatus;
  fulfilmentType: FulfilmentType;
  status: OrderStatus;
};

export type AdminOrderDetail = AdminOrderListItem & {
  confirmedAt: string | null;
  processingAt: string | null;
  shippedAt: string | null;
  readyForPickupAt: string | null;
  deliveredAt: string | null;
  estimatedDeliveryDate: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  customerPhone: string | null;
  shippingAddressLine1: string | null;
  shippingAddressLine2: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  pickupLocation: string | null;
  subtotal: string;
  shippingFee: string;
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
  payment: {
    provider: string;
    amount: string;
    status: PaymentStatus;
  } | null;
};

export type OrderFilters = {
  search: string;
  status: "" | OrderStatus;
  paymentStatus: "" | PaymentStatus;
  fulfilmentType: "" | FulfilmentType;
};

export const EMPTY_ORDER_FILTERS: OrderFilters = {
  search: "",
  status: "",
  paymentStatus: "",
  fulfilmentType: "",
};

export const ORDER_PAGE_SIZE = 25;

export function buildOrderListQuery(filters: OrderFilters, cursor: string | null): string {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) params.set("search", search);
  if (filters.status) params.set("status", filters.status);
  if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
  if (filters.fulfilmentType) params.set("fulfilmentType", filters.fulfilmentType);
  params.set("limit", String(ORDER_PAGE_SIZE));
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function orderStatusLabel(type: FulfilmentType, status: OrderStatus): string {
  if (status === "READY_FOR_PICKUP") return "Ready for collection";
  if (status === "SHIPPED") return "Out for delivery / Shipped";
  if (status === "DELIVERED" && type === "PICKUP") return "Collected";
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export type FulfilmentAction = {
  targetStatus: "PROCESSING" | "SHIPPED" | "READY_FOR_PICKUP" | "DELIVERED";
  label: string;
};

function hasAuthoritativePaidSnapshot(order: AdminOrderDetail): boolean {
  return Boolean(
    order.paymentStatus === "PAID"
      && order.payment?.status === "PAID"
      && order.payment.amount === order.total
      && order.confirmedAt
      && !order.cancelledAt,
  );
}

export function nextFulfilmentAction(order: AdminOrderDetail): FulfilmentAction | null {
  if (!hasAuthoritativePaidSnapshot(order)) return null;
  if (order.status === "CONFIRMED") return { targetStatus: "PROCESSING", label: "Start processing" };
  if (order.fulfilmentType === "DELIVERY" && order.status === "PROCESSING") {
    return { targetStatus: "SHIPPED", label: "Mark shipped" };
  }
  if (order.fulfilmentType === "DELIVERY" && order.status === "SHIPPED") {
    return { targetStatus: "DELIVERED", label: "Mark delivered" };
  }
  if (order.fulfilmentType === "PICKUP" && order.status === "PROCESSING") {
    return { targetStatus: "READY_FOR_PICKUP", label: "Ready for collection" };
  }
  if (order.fulfilmentType === "PICKUP" && order.status === "READY_FOR_PICKUP") {
    return { targetStatus: "DELIVERED", label: "Mark collected" };
  }
  return null;
}

export function canEditEstimatedDelivery(order: AdminOrderDetail): boolean {
  return order.fulfilmentType === "DELIVERY"
    && hasAuthoritativePaidSnapshot(order)
    && ["CONFIRMED", "PROCESSING", "SHIPPED"].includes(order.status);
}

export function johannesburgToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function formatMoney(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateTime(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatCalendarDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not set";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "UTC",
    dateStyle: "medium",
  }).format(date);
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
