import "server-only";

import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

import { nextProductUpdatedAt } from "../concurrency";
import { productId } from "../input";
import { rethrowKnownSaleConstraint, saleBasePriceConflict } from "./errors";
import { saleMutationInput } from "./input";
import { serializeAdminVariantSale } from "./serialize";

const transactionOptions = {
  maxWait: 5000,
  timeout: 10000,
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
};

function changed(): never {
  throw new ApiError("Product changed before this update. Reload and try again", 409);
}

export async function updateAdminProductVariantSale(productValue: string, variantValue: string, value: unknown) {
  await requireAdmin();
  const validProductId = productId(productValue);
  const validVariantId = productId(variantValue);
  const input = saleMutationInput(value);
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
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
      const existing = product.variants[0];
      if (!existing) throw new ApiError("Variant not found", 404);
      if (product.updatedAt.toISOString() !== input.expectedUpdatedAt) changed();
      if (input.salePrice && !input.salePrice.lt(existing.price)) saleBasePriceConflict();

      const pricingAt = new Date();
      const updatedAt = nextProductUpdatedAt(product.updatedAt, pricingAt);
      const claim = await tx.product.updateMany({
        where: { id: product.id, updatedAt: product.updatedAt },
        data: { updatedAt },
      });
      if (claim.count !== 1) changed();

      const updated = await tx.productVariant.update({
        where: { id: existing.id },
        data: {
          salePrice: input.salePrice,
          saleStartsAt: input.saleStartsAt,
          saleEndsAt: input.saleEndsAt,
        },
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
      });
      return serializeAdminVariantSale(product.id, updatedAt, updated, pricingAt);
    }, transactionOptions);
  } catch (error) {
    rethrowKnownSaleConstraint(error);
  }
}
