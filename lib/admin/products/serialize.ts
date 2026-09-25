import "server-only";

import type { Prisma } from "@prisma/client";

export const productListSelect = {
  id: true,
  name: true,
  slug: true,
  badge: true,
  isActive: true,
  featured: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true, slug: true } },
  images: { select: { url: true, alt: true }, orderBy: { position: "asc" as const }, take: 1 },
  variants: { select: { price: true } },
  _count: { select: { variants: true } },
} satisfies Prisma.ProductSelect;

export const productDetailSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  badge: true,
  details: true,
  isActive: true,
  featured: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true, slug: true } },
  images: {
    select: { url: true, alt: true, position: true },
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
  },
  variants: {
    select: { id: true, sku: true, size: true, color: true, price: true, createdAt: true, updatedAt: true },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.ProductSelect;

type ProductListRow = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;
type ProductDetailRow = Prisma.ProductGetPayload<{ select: typeof productDetailSelect }>;

function priceRange(variants: Array<{ price: Prisma.Decimal }>) {
  if (variants.length === 0) return { minimumPrice: null, maximumPrice: null };
  let minimum = variants[0].price;
  let maximum = variants[0].price;
  for (const variant of variants.slice(1)) {
    if (variant.price.lt(minimum)) minimum = variant.price;
    if (variant.price.gt(maximum)) maximum = variant.price;
  }
  return { minimumPrice: minimum.toFixed(2), maximumPrice: maximum.toFixed(2) };
}

export function serializeProductListItem(row: ProductListRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    badge: row.badge,
    isActive: row.isActive,
    featured: row.featured,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    category: row.category,
    thumbnail: row.images[0] ?? null,
    variantCount: row._count.variants,
    ...priceRange(row.variants),
  };
}

export function serializeProductDetail(row: ProductDetailRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    badge: row.badge,
    details: row.details,
    isActive: row.isActive,
    featured: row.featured,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    category: row.category,
    images: row.images.map((image) => ({ url: image.url, alt: image.alt, position: image.position })),
    variants: row.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      price: variant.price.toFixed(2),
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    })),
  };
}

export type AdminProductListItem = ReturnType<typeof serializeProductListItem>;
export type AdminProductDetail = ReturnType<typeof serializeProductDetail>;
