import type { Prisma } from "@prisma/client";

export const publicProductInclude = {
  category: true,
  images: true,
  variants: {
    include: { inventory: true },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof publicProductInclude;
}>;

// Shapes the DB record for API responses; nothing here exposes fields the storefront doesn't need.
export function serializeProduct(product: ProductWithRelations) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    badge: product.badge,
    details: product.details,
    featured: product.featured,
    isActive: product.isActive,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    category: {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    },
    images: [...product.images]
      .sort((a, b) => a.position - b.position)
      .map((image) => ({ id: image.id, url: image.url, alt: image.alt, position: image.position })),
    variants: [...product.variants]
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        price: Number(variant.price),
        inventory: {
          quantity: variant.inventory?.quantity ?? 0,
          inStock: (variant.inventory?.quantity ?? 0) > 0,
        },
      })),
  };
}
