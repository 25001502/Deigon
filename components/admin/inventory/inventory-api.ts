import {
  adjustmentPayload,
  buildInventoryQuery,
  type AdjustmentDraft,
  type InventoryAdjustment,
  type InventoryFilters,
  type InventoryItem,
} from "./inventory-ui";

export type ApiResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthenticated" | "forbidden" | "not-found" | "conflict" | "invalid" | "error" };

type Fetcher = typeof fetch;

async function request<T>(fetcher: Fetcher, url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try { response = await fetcher(url, { credentials: "same-origin", cache: "no-store", ...init }); }
  catch { return { kind: "error" }; }
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
  } catch { return { kind: "error" }; }
}

const json = (body: unknown): RequestInit => ({
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function fetchInventory(filters: InventoryFilters, cursor: string | null, fetcher: Fetcher = fetch) {
  return request<{ inventory: InventoryItem[]; nextCursor: string | null }>(
    fetcher,
    `/api/admin/inventory?${buildInventoryQuery(filters, cursor)}`,
  );
}

export function fetchInventoryDetail(variantId: string, fetcher: Fetcher = fetch) {
  return request<InventoryItem>(fetcher, `/api/admin/inventory/${encodeURIComponent(variantId)}`);
}

export function fetchInventoryAdjustments(variantId: string, cursor: string | null, fetcher: Fetcher = fetch) {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return request<{ adjustments: InventoryAdjustment[]; nextCursor: string | null }>(
    fetcher,
    `/api/admin/inventory/${encodeURIComponent(variantId)}/adjustments?${params}`,
  );
}

export function fetchInventoryCategories(fetcher: Fetcher = fetch) {
  return request<Array<{ name: string; slug: string }>>(fetcher, "/api/admin/products/categories");
}

export function createInventoryAdjustment(
  detail: InventoryItem,
  draft: AdjustmentDraft,
  idempotencyKey: string,
  fetcher: Fetcher = fetch,
) {
  return request<{ inventory: InventoryItem; adjustment: InventoryAdjustment; replayed: boolean }>(
    fetcher,
    `/api/admin/inventory/${encodeURIComponent(detail.variantId)}/adjustments`,
    { method: "POST", ...json(adjustmentPayload(detail, draft, idempotencyKey)) },
  );
}
