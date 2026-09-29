import "server-only";

import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/errors";

const SALE_BELOW_BASE_CONSTRAINT = "ProductVariant_sale_price_below_base_check";
const CONFLICT_MESSAGE = "The base price must remain above the configured sale price. Update or remove the sale first.";

function metadataContains(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value.includes(expected);
  if (Array.isArray(value)) return value.some((entry) => metadataContains(entry, expected));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) => metadataContains(entry, expected));
  }
  return false;
}

export function saleBasePriceConflict(): never {
  throw new ApiError(CONFLICT_MESSAGE, 409);
}

export function rethrowKnownSaleConstraint(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2004"
      || (error.code === "P2039" && metadataContains(error.meta, "23514")))
    && metadataContains(error.meta, SALE_BELOW_BASE_CONSTRAINT)
  ) {
    saleBasePriceConflict();
  }
  throw error;
}
