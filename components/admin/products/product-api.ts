import {
  buildProductListQuery,
  type AdminProductDetail,
  type AdminProductListItem,
  type ProductCategory,
  type ProductDraft,
  type ProductFilters,
  type VariantDraft,
  productPayload,
  variantPayload,
} from "./product-ui";

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
    return payload.ok === true && Object.hasOwn(payload, "data") ? { kind: "ok", data: payload.data as T } : { kind: "error" };
  } catch { return { kind: "error" }; }
}

const json = (body: unknown): RequestInit => ({
  headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export function fetchProducts(filters: ProductFilters, cursor: string | null, fetcher: Fetcher = fetch) {
  return request<{ products: AdminProductListItem[]; nextCursor: string | null }>(fetcher, `/api/admin/products?${buildProductListQuery(filters, cursor)}`);
}
export function fetchProduct(id: string, fetcher: Fetcher = fetch) {
  return request<AdminProductDetail>(fetcher, `/api/admin/products/${encodeURIComponent(id)}`);
}
export function fetchCategories(fetcher: Fetcher = fetch) {
  return request<ProductCategory[]>(fetcher, "/api/admin/products/categories");
}
export function createProduct(draft: ProductDraft, variants: VariantDraft[], fetcher: Fetcher = fetch) {
  return request<AdminProductDetail>(fetcher, "/api/admin/products", { method: "POST", ...json({ ...productPayload(draft), variants: variants.map(variantPayload) }) });
}
export function updateProduct(product: AdminProductDetail, draft: ProductDraft, fetcher: Fetcher = fetch) {
  return request<AdminProductDetail>(fetcher, `/api/admin/products/${encodeURIComponent(product.id)}`, { method: "PATCH", ...json({ expectedUpdatedAt: product.updatedAt, ...productPayload(draft) }) });
}
export function archiveProduct(product: AdminProductDetail, fetcher: Fetcher = fetch) {
  return request<AdminProductDetail>(fetcher, `/api/admin/products/${encodeURIComponent(product.id)}`, { method: "DELETE", ...json({ expectedUpdatedAt: product.updatedAt }) });
}
export function createVariant(product: AdminProductDetail, draft: VariantDraft, fetcher: Fetcher = fetch) {
  return request<AdminProductDetail>(fetcher, `/api/admin/products/${encodeURIComponent(product.id)}/variants`, { method: "POST", ...json({ expectedUpdatedAt: product.updatedAt, ...variantPayload(draft) }) });
}
export function updateVariant(product: AdminProductDetail, variantId: string, draft: VariantDraft, fetcher: Fetcher = fetch) {
  return request<AdminProductDetail>(fetcher, `/api/admin/products/${encodeURIComponent(product.id)}/variants/${encodeURIComponent(variantId)}`, { method: "PATCH", ...json({ expectedUpdatedAt: product.updatedAt, ...variantPayload(draft) }) });
}
