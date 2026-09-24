import {
  FULFILMENT_TYPES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type CustomerOrderDetail,
} from "./order-ui";

export type CustomerOrderResult =
  | { kind: "ok"; data: CustomerOrderDetail }
  | { kind: "unauthenticated" }
  | { kind: "not-found" }
  | { kind: "error" };

type Fetcher = typeof fetch;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCustomerOrder(value: unknown): value is CustomerOrderDetail {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;
  const requiredStrings = [
    "orderNumber",
    "subtotal",
    "shippingFee",
    "total",
    "customerName",
    "customerEmail",
    "createdAt",
  ];
  const nullableStrings = [
    "customerPhone",
    "shippingAddressLine1",
    "shippingAddressLine2",
    "shippingCity",
    "shippingProvince",
    "shippingPostalCode",
    "shippingCountry",
    "pickupLocation",
    "confirmedAt",
    "processingAt",
    "shippedAt",
    "readyForPickupAt",
    "deliveredAt",
    "estimatedDeliveryDate",
    "cancelledAt",
  ];

  return requiredStrings.every((key) => typeof order[key] === "string")
    && nullableStrings.every((key) => isNullableString(order[key]))
    && ORDER_STATUSES.includes(order.status as CustomerOrderDetail["status"])
    && PAYMENT_STATUSES.includes(order.paymentStatus as CustomerOrderDetail["paymentStatus"])
    && FULFILMENT_TYPES.includes(order.fulfilmentType as CustomerOrderDetail["fulfilmentType"])
    && Array.isArray(order.items)
    && order.items.every((value) => {
      if (!value || typeof value !== "object") return false;
      const item = value as Record<string, unknown>;
      return ["title", "sku", "unitPrice", "lineTotal"].every((key) => typeof item[key] === "string")
        && ["size", "color", "imageUrl"].every((key) => isNullableString(item[key]))
        && Number.isInteger(item.quantity)
        && Number(item.quantity) > 0;
    });
}

export async function fetchCustomerOrder(
  orderId: string,
  fetcher: Fetcher = fetch,
): Promise<CustomerOrderResult> {
  let response: Response;
  try {
    response = await fetcher(`/api/account/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    return { kind: "error" };
  }

  if (response.status === 401 || response.status === 403) return { kind: "unauthenticated" };
  if (response.status === 404) return { kind: "not-found" };
  if (!response.ok) return { kind: "error" };

  try {
    const payload = await response.json() as { ok?: unknown; data?: unknown };
    return payload.ok === true && isCustomerOrder(payload.data)
      ? { kind: "ok", data: payload.data }
      : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
