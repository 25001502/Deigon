import "server-only";

import { resolveVariantPrice } from "@/lib/pricing/resolve-variant-price";

import type { SaleVariantRow } from "./types";

export function serializeAdminVariantSale(
  productId: string,
  productUpdatedAt: Date,
  variant: SaleVariantRow,
  at: Date,
) {
  const resolved = resolveVariantPrice(variant, at);
  return {
    productId,
    variantId: variant.id,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    normalPrice: resolved.normalPrice.toFixed(2),
    salePrice: variant.salePrice?.toFixed(2) ?? null,
    saleStartsAt: variant.saleStartsAt?.toISOString() ?? null,
    saleEndsAt: variant.saleEndsAt?.toISOString() ?? null,
    effectivePrice: resolved.effectivePrice.toFixed(2),
    isOnSale: resolved.isOnSale,
    state: resolved.state,
    productUpdatedAt: productUpdatedAt.toISOString(),
  };
}

export type AdminVariantSale = ReturnType<typeof serializeAdminVariantSale>;
