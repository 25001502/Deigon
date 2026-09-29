import type { AdminVariantSale, SaleMutationPayload } from "./sale-ui";

export type SaleApiResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "invalid" | "conflict"; message: string | null }
  | { kind: "unauthenticated" | "forbidden" | "not-found" | "error" };

type Fetcher = typeof fetch;

function safeMessage(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 300 ? value : null;
}

async function request<T>(fetcher: Fetcher, url: string, init?: RequestInit): Promise<SaleApiResult<T>> {
  let response: Response;
  try { response = await fetcher(url, { credentials: "same-origin", cache: "no-store", ...init }); }
  catch { return { kind: "error" }; }
  if (response.status === 401) return { kind: "unauthenticated" };
  if (response.status === 403) return { kind: "forbidden" };
  if (response.status === 404) return { kind: "not-found" };
  if (response.status === 400 || response.status === 409) {
    try {
      const payload = await response.json() as { message?: unknown };
      return { kind: response.status === 400 ? "invalid" : "conflict", message: safeMessage(payload.message) };
    } catch {
      return { kind: response.status === 400 ? "invalid" : "conflict", message: null };
    }
  }
  if (!response.ok) return { kind: "error" };
  try {
    const payload = await response.json() as { ok?: unknown; data?: T };
    return payload.ok === true && Object.hasOwn(payload, "data")
      ? { kind: "ok", data: payload.data as T }
      : { kind: "error" };
  } catch { return { kind: "error" }; }
}

function endpoint(productId: string, variantId: string): string {
  return `/api/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}/sale`;
}

export function fetchVariantSale(productId: string, variantId: string, fetcher: Fetcher = fetch) {
  return request<AdminVariantSale>(fetcher, endpoint(productId, variantId));
}

export function updateVariantSale(
  productId: string,
  variantId: string,
  body: SaleMutationPayload,
  fetcher: Fetcher = fetch,
) {
  return request<AdminVariantSale>(fetcher, endpoint(productId, variantId), {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
