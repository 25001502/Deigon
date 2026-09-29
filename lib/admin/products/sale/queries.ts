import "server-only";

import { ApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

import { productId } from "../input";
import { serializeAdminVariantSale } from "./serialize";

export async function getAdminProductVariantSale(productValue: string, variantValue: string) {
  await requireAdmin();
  const validProductId = productId(productValue);
  const validVariantId = productId(variantValue);
  const product = await prisma.product.findUnique({
    where: { id: validProductId },
    select: {
      id: true,
      updatedAt: true,
      variants: {
        where: { id: validVariantId },
        take: 1,
        select: {
          id: true,
          sku: true,
          size: true,
          color: true,
          price: true,
          salePrice: true,
          saleStartsAt: true,
          saleEndsAt: true,
        },
      },
    },
  });
  if (!product) throw new ApiError("Product not found", 404);
  const variant = product.variants[0];
  if (!variant) throw new ApiError("Variant not found", 404);
  const pricingAt = new Date();
  return serializeAdminVariantSale(product.id, product.updatedAt, variant, pricingAt);
}
