import type {
  AdminOrderDetail,
  AdminOrderListItem,
  OrderFilters,
  OrderStatus,
} from "./order-ui";
import { buildOrderListQuery } from "./order-ui";

export type ApiResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "not-found" }
  | { kind: "conflict" }
  | { kind: "invalid" }
  | { kind: "error" };

type Fetcher = typeof fetch;

async function request<T>(fetcher: Fetcher, url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetcher(url, { credentials: "same-origin", cache: "no-store", ...init });
  } catch {
    return { kind: "error" };
  }
  if (response.status === 401) return { kind: "unauthenticated" };
  if (response.status === 403) return { kind: "forbidden" };
  if (response.status === 404) return { kind: "not-found" };
  if (response.status === 409) return { kind: "conflict" };
  if (response.status === 400) return { kind: "invalid" };
  if (!response.ok) return { kind: "error" };
  try {
    const payload = await response.json() as { ok?: unknown; data?: T };
    return payload.ok === true && Object.hasOwn(payload, "data")
      ? { kind: "ok", data: payload.data as T }
      : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export function fetchAdminOrders(
  filters: OrderFilters,
  cursor: string | null,
  fetcher: Fetcher = fetch,
): Promise<ApiResult<{ orders: AdminOrderListItem[]; nextCursor: string | null }>> {
  return request(fetcher, `/api/admin/orders?${buildOrderListQuery(filters, cursor)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
}

export function fetchAdminOrder(orderId: string, fetcher: Fetcher = fetch): Promise<ApiResult<AdminOrderDetail>> {
  return request(fetcher, `/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
}

export function transitionAdminOrder(
  orderId: string,
  expectedStatus: OrderStatus,
  targetStatus: OrderStatus,
  fetcher: Fetcher = fetch,
): Promise<ApiResult<AdminOrderDetail>> {
  return request(fetcher, `/api/admin/orders/${encodeURIComponent(orderId)}/fulfilment`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ expectedStatus, targetStatus }),
  });
}

export function updateAdminOrderEstimate(
  order: AdminOrderDetail,
  estimatedDeliveryDate: string | null,
  fetcher: Fetcher = fetch,
): Promise<ApiResult<AdminOrderDetail>> {
  return request(fetcher, `/api/admin/orders/${encodeURIComponent(order.id)}/estimated-delivery`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedStatus: order.status,
      expectedEstimatedDeliveryDate: order.estimatedDeliveryDate,
      estimatedDeliveryDate,
    }),
  });
}

export type MutationResolution<T> =
  | { kind: "updated"; data: T; refreshFailed: boolean }
  | { kind: "conflict"; latest: ApiResult<T> }
  | { kind: "failed"; result: Exclude<ApiResult<T>, { kind: "ok" }> };

export async function performOrderMutation<T>(
  mutate: () => Promise<ApiResult<T>>,
  refresh: () => Promise<ApiResult<T>>,
): Promise<MutationResolution<T>> {
  const mutation = await mutate();
  if (mutation.kind === "conflict") {
    return { kind: "conflict", latest: await refresh() };
  }
  if (mutation.kind !== "ok") return { kind: "failed", result: mutation };
  const latest = await refresh();
  if (latest.kind === "unauthenticated" || latest.kind === "forbidden") {
    return { kind: "failed", result: latest };
  }
  return latest.kind === "ok"
    ? { kind: "updated", data: latest.data, refreshFailed: false }
    : { kind: "updated", data: mutation.data, refreshFailed: true };
}
