import "server-only";

import { createHash } from "node:crypto";

import { ApiError } from "@/lib/api/errors";

import type {
  CreateProductInput,
  ProductFeaturedFilter,
  ProductImageInput,
  ProductListInput,
  ProductStatusFilter,
  ProductVariantInput,
  UpdateProductInput,
  VariantMutationInput,
} from "./types";

function invalid(message = "Invalid product request"): never {
  throw new ApiError(message, 400);
}

function object(value: unknown, keys: string[], message = "Invalid product request"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(message);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key))) invalid(message);
  return result;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") invalid(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) invalid(`${field} is required and must be at most ${max} characters`);
  return normalized;
}

function nullableText(value: unknown, field: string, max: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string") invalid(`${field} must be a string or null`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) invalid(`${field} must be at most ${max} characters`);
  return normalized;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") invalid(`${field} must be a boolean`);
  return value;
}

export function productId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{10,128}$/.test(value)) invalid();
  return value;
}

function slug(value: unknown, field = "slug"): string {
  const normalized = text(value, field, 160);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    invalid(`${field} must contain lowercase letters, numbers, and single hyphens only`);
  }
  return normalized;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string") invalid("expectedUpdatedAt must be an ISO timestamp");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) invalid("expectedUpdatedAt must be an ISO timestamp");
  return value;
}

function price(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) {
    invalid(`${field} must be a positive amount with no more than two decimal places`);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99) {
    invalid(`${field} must be a positive amount with no more than two decimal places`);
  }
  return amount.toFixed(2);
}

function imageUrl(value: unknown, field: string): string {
  const normalized = text(value, field, 2048);
  if (normalized.startsWith("/") && !normalized.startsWith("//") && !normalized.includes("\\")) return normalized;
  let parsed: URL;
  try { parsed = new URL(normalized); } catch { invalid(`${field} is not a supported product image URL`); }
  const supportedSupabase = parsed.protocol === "https:"
    && parsed.hostname === "hvawfylsdaormrkghbbw.supabase.co"
    && parsed.pathname.startsWith("/storage/v1/object/sign/products/");
  const supportedDeigon = parsed.protocol === "https:"
    && parsed.hostname === "www.deigon.co.za"
    && parsed.pathname.startsWith("/cdn/shop/files/");
  if (parsed.username || parsed.password || parsed.hash || (!supportedSupabase && !supportedDeigon)) {
    invalid(`${field} is not a supported product image URL`);
  }
  return parsed.toString();
}

function images(value: unknown): ProductImageInput[] {
  if (!Array.isArray(value) || value.length > 12) invalid("images must be an array with at most 12 entries");
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const image = object(entry, ["url", "alt"], `images[${index}] is invalid`);
    const url = imageUrl(image.url, `images[${index}].url`);
    if (seen.has(url)) invalid("Product image URLs must be unique");
    seen.add(url);
    return { url, alt: nullableText(image.alt, `images[${index}].alt`, 200) };
  });
}

function details(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 30) invalid("details must be an array with at most 30 entries");
  const result = value.map((entry, index) => text(entry, `details[${index}]`, 300));
  if (new Set(result.map((entry) => entry.toLocaleLowerCase())).size !== result.length) invalid("Product details must be unique");
  return result;
}

function variant(value: unknown, index?: number): ProductVariantInput {
  const prefix = index === undefined ? "variant" : `variants[${index}]`;
  const data = object(value, ["sku", "size", "color", "price"], `${prefix} is invalid`);
  const sku = text(data.sku, `${prefix}.sku`, 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sku)) invalid(`${prefix}.sku contains unsupported characters`);
  return {
    sku,
    size: nullableText(data.size, `${prefix}.size`, 80),
    color: nullableText(data.color, `${prefix}.color`, 80),
    price: price(data.price, `${prefix}.price`),
  };
}

function combinationKey(value: Pick<ProductVariantInput, "size" | "color">): string {
  return `${value.size?.toLocaleLowerCase() ?? ""}\u0000${value.color?.toLocaleLowerCase() ?? ""}`;
}

function variants(value: unknown): ProductVariantInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    invalid("variants must contain between 1 and 100 entries");
  }
  const result = value.map((entry, index) => variant(entry, index));
  if (new Set(result.map((entry) => entry.sku.toLocaleLowerCase())).size !== result.length) invalid("Variant SKUs must be unique");
  if (new Set(result.map(combinationKey)).size !== result.length) invalid("Variant size and color combinations must be unique");
  return result;
}

const productKeys = [
  "name", "slug", "description", "badge", "details", "categorySlug",
  "featured", "isActive", "images",
];

function productFields(data: Record<string, unknown>) {
  return {
    name: text(data.name, "name", 160),
    slug: slug(data.slug),
    description: nullableText(data.description, "description", 10_000),
    badge: nullableText(data.badge, "badge", 80),
    details: details(data.details),
    categorySlug: slug(data.categorySlug, "categorySlug"),
    featured: boolean(data.featured, "featured"),
    isActive: boolean(data.isActive, "isActive"),
    images: images(data.images),
  };
}

export function createProductInput(value: unknown): CreateProductInput {
  const data = object(value, [...productKeys, "variants"]);
  return { ...productFields(data), variants: variants(data.variants) };
}

export function updateProductInput(value: unknown): UpdateProductInput {
  const data = object(value, ["expectedUpdatedAt", ...productKeys]);
  return { expectedUpdatedAt: timestamp(data.expectedUpdatedAt), ...productFields(data) };
}

export function variantMutationInput(value: unknown): VariantMutationInput {
  const data = object(value, ["expectedUpdatedAt", "sku", "size", "color", "price"]);
  return {
    expectedUpdatedAt: timestamp(data.expectedUpdatedAt),
    ...variant({ sku: data.sku, size: data.size, color: data.color, price: data.price }),
  };
}

export function archiveInput(value: unknown): { expectedUpdatedAt: string } {
  const data = object(value, ["expectedUpdatedAt"]);
  return { expectedUpdatedAt: timestamp(data.expectedUpdatedAt) };
}

export function productListInput(params: URLSearchParams): ProductListInput {
  const allowed = ["search", "status", "featured", "category", "limit", "cursor"];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid("Invalid product list query");
  }
  const search = (params.get("search") ?? "").trim();
  if (search.length > 160) invalid("Invalid product list query");
  const rawStatus = params.get("status");
  const status = rawStatus === null || rawStatus === "" ? undefined : rawStatus as ProductStatusFilter;
  if (status && !["ACTIVE", "INACTIVE"].includes(status)) invalid("Invalid product list query");
  const rawFeatured = params.get("featured");
  const featured = rawFeatured === null || rawFeatured === "" ? undefined : rawFeatured as ProductFeaturedFilter;
  if (featured && !["FEATURED", "STANDARD"].includes(featured)) invalid("Invalid product list query");
  const category = params.has("category") && params.get("category") !== "" ? slug(params.get("category"), "category") : undefined;
  const rawLimit = params.get("limit") ?? "20";
  if (!/^[1-9]\d?$/.test(rawLimit) || Number(rawLimit) > 50) invalid("Invalid product list query");
  const filterKey = createHash("sha256").update(JSON.stringify([search.toLocaleLowerCase(), status, featured, category])).digest("hex");
  const result: ProductListInput = { search, status, featured, category, limit: Number(rawLimit), filterKey };
  if (params.has("cursor")) {
    const encoded = params.get("cursor")!;
    if (encoded.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) invalid("Invalid product list query");
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { invalid("Invalid product list query"); }
    const cursor = object(decoded, ["v", "filterKey", "updatedAt", "id"], "Invalid product list query");
    if (cursor.v !== 1 || cursor.filterKey !== filterKey || typeof cursor.updatedAt !== "string") invalid("Invalid product list query");
    const date = new Date(cursor.updatedAt);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== cursor.updatedAt) invalid("Invalid product list query");
    result.cursor = { updatedAt: cursor.updatedAt, id: productId(cursor.id) };
  }
  return result;
}

export function encodeProductCursor(input: ProductListInput, row: { id: string; updatedAt: Date }): string {
  return Buffer.from(JSON.stringify({ v: 1, filterKey: input.filterKey, updatedAt: row.updatedAt.toISOString(), id: row.id })).toString("base64url");
}

export function variantCombinationKey(value: Pick<ProductVariantInput, "size" | "color">): string {
  return combinationKey(value);
}
