export type AdminProductImage = { url: string; alt: string | null; position: number };
export type AdminProductVariant = {
  id: string; sku: string; size: string | null; color: string | null; price: string;
  createdAt: string; updatedAt: string;
};
export type AdminProductDetail = {
  id: string; name: string; slug: string; description: string | null; badge: string | null;
  details: string[]; isActive: boolean; featured: boolean; createdAt: string; updatedAt: string;
  category: { name: string; slug: string }; images: AdminProductImage[]; variants: AdminProductVariant[];
};
export type AdminProductListItem = {
  id: string; name: string; slug: string; badge: string | null; isActive: boolean; featured: boolean;
  createdAt: string; updatedAt: string; category: { name: string; slug: string };
  thumbnail: { url: string; alt: string | null } | null; variantCount: number;
  minimumPrice: string | null; maximumPrice: string | null;
};
export type ProductFilters = { search: string; status: "" | "ACTIVE" | "INACTIVE"; featured: "" | "FEATURED" | "STANDARD"; category: string };
export type ProductCategory = { name: string; slug: string };
export type VariantDraft = { sku: string; size: string; color: string; price: string };
export type ProductDraft = {
  name: string; slug: string; description: string; badge: string; details: string;
  categorySlug: string; featured: boolean; isActive: boolean; images: string;
};

export const EMPTY_FILTERS: ProductFilters = { search: "", status: "", featured: "", category: "" };
export const EMPTY_VARIANT: VariantDraft = { sku: "", size: "", color: "", price: "" };
export const EMPTY_PRODUCT: ProductDraft = {
  name: "", slug: "", description: "", badge: "", details: "", categorySlug: "",
  featured: false, isActive: true, images: "",
};

export function buildProductListQuery(filters: ProductFilters, cursor: string | null) {
  const params = new URLSearchParams({ limit: "20" });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function money(value: string | null) {
  return value === null ? "No price" : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value));
}

export function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value));
}

export function detailToDraft(product: AdminProductDetail): ProductDraft {
  return {
    name: product.name, slug: product.slug, description: product.description ?? "", badge: product.badge ?? "",
    details: product.details.join("\n"), categorySlug: product.category.slug, featured: product.featured,
    isActive: product.isActive,
    images: product.images.map((image) => `${image.url}${image.alt ? ` | ${image.alt}` : ""}`).join("\n"),
  };
}

export function productPayload(draft: ProductDraft) {
  return {
    name: draft.name,
    slug: draft.slug,
    description: draft.description.trim() || null,
    badge: draft.badge.trim() || null,
    details: draft.details.split("\n").map((item) => item.trim()).filter(Boolean),
    categorySlug: draft.categorySlug,
    featured: draft.featured,
    isActive: draft.isActive,
    images: draft.images.split("\n").map((item) => item.trim()).filter(Boolean).map((item) => {
      const [url, ...alt] = item.split("|");
      return { url: url.trim(), alt: alt.join("|").trim() || null };
    }),
  };
}

export function variantPayload(variant: VariantDraft) {
  return { sku: variant.sku, size: variant.size.trim() || null, color: variant.color.trim() || null, price: variant.price };
}
