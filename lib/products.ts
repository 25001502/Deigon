import type { Product } from "@/lib/data/catalog";
import { headers } from "next/headers";

type ApiProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  badge: string | null;
  details: string[];
  featured: boolean;
  isActive: boolean;
  category: { id: string; name: string; slug: string };
  images: { id: string; url: string; alt: string | null; position: number }[];
  variants: {
    id: string;
    sku: string;
    size: string | null;
    color: string | null;
    price: number;
    inventory: { quantity: number; inStock: boolean };
  }[];
};

type ProductsResponse = {
  ok: true;
  products: ApiProduct[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type ProductResponse = { ok: true; product: ApiProduct };

export type StorefrontProduct = Product & { variantId?: string };

export class ProductApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ProductApiError";
  }
}

async function apiOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";

  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${await apiOrigin()}${path}`, { cache: "no-store" });

  if (!response.ok) {
    throw new ProductApiError(`Products service returned ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}
function themeClassFor(categorySlug: string) {
  return categorySlug === "patron-fragrance" ? "theme-collection-patron" : "theme-collection-foxygeon";
}

function normalizeProduct(product: ApiProduct): StorefrontProduct {
  const descriptionParts = (product.description ?? "").split("\n\n");
  const images = product.images.sort((a, b) => a.position - b.position).map((image) => image.url);
  const firstVariant = product.variants[0];

  return {
    handle: product.slug,
    title: product.name,
    vendor: product.category.name,
    price: firstVariant?.price ?? 0,
    badge: product.badge ?? "",
    collectionHandle: product.category.slug,
    shortDescription: descriptionParts[0] ?? "",
    description: descriptionParts.slice(1).join("\n\n") || (descriptionParts[0] ?? ""),
    details: product.details,
    themeClass: themeClassFor(product.category.slug),
    image: images[0],
    images,
    featured: product.featured,
    variantId: firstVariant?.id,
  };
}

export async function getProducts(options: { category?: string; search?: string; pageSize?: number } = {}) {
  const params = new URLSearchParams();
  params.set("pageSize", String(options.pageSize ?? 50));
  if (options.category && options.category !== "all") params.set("category", options.category);
  if (options.search) params.set("q", options.search);

  const response = await request<ProductsResponse>(`/api/products?${params.toString()}`);
  return {
    products: response.products.map(normalizeProduct),
    pagination: response.pagination,
  };
}

export async function getProductBySlug(slug: string) {
  const response = await request<ProductResponse>(`/api/products/${encodeURIComponent(slug)}`);
  return normalizeProduct(response.product);
}