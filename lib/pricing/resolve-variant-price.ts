import "server-only";

import { Prisma } from "@prisma/client";

export type VariantSaleState = "NONE" | "SCHEDULED" | "ACTIVE" | "EXPIRED";

export type VariantPriceInput = {
  price: Prisma.Decimal;
  salePrice: Prisma.Decimal | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
};

export type ResolvedVariantPrice = {
  normalPrice: Prisma.Decimal;
  effectivePrice: Prisma.Decimal;
  isOnSale: boolean;
  state: VariantSaleState;
};

/**
 * Indicates a malformed in-memory sale configuration. Persisted values are also
 * protected by PostgreSQL CHECK constraints, but callers must fail closed rather
 * than accidentally treating malformed data as a valid discount.
 */
export class VariantPricingInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VariantPricingInvariantError";
  }
}

function validMoney(value: unknown): value is Prisma.Decimal {
  return (
    Prisma.Decimal.isDecimal(value)
    && value.isFinite()
    && value.gt(0)
    && value.decimalPlaces() <= 2
  );
}

function timestamp(value: Date | null, field: string): number | null {
  if (value === null) return null;
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) {
    throw new VariantPricingInvariantError(`${field} must be a valid instant.`);
  }
  return milliseconds;
}

function invalid(message: string): never {
  throw new VariantPricingInvariantError(message);
}

/**
 * Resolves a variant's price for one caller-supplied instant. It is deliberately
 * pure: no database access, browser state, or clock lookup is performed here.
 */
export function resolveVariantPrice(input: VariantPriceInput, at: Date): ResolvedVariantPrice {
  if (!validMoney(input.price)) invalid("Normal price must be a positive Decimal with at most two decimal places.");

  const atMilliseconds = timestamp(at, "at");
  if (atMilliseconds === null) invalid("at must be a valid instant.");

  const startMilliseconds = timestamp(input.saleStartsAt, "saleStartsAt");
  const endMilliseconds = timestamp(input.saleEndsAt, "saleEndsAt");

  if (input.salePrice === null) {
    if (startMilliseconds !== null || endMilliseconds !== null) {
      invalid("Sale schedule timestamps require a sale price.");
    }
    return {
      normalPrice: input.price,
      effectivePrice: input.price,
      isOnSale: false,
      state: "NONE",
    };
  }

  if (!validMoney(input.salePrice)) invalid("Sale price must be a positive Decimal with at most two decimal places.");
  if (!input.salePrice.lt(input.price)) invalid("Sale price must be lower than the normal price.");
  if (startMilliseconds !== null && endMilliseconds !== null && endMilliseconds <= startMilliseconds) {
    invalid("saleEndsAt must be later than saleStartsAt.");
  }

  if (startMilliseconds !== null && atMilliseconds < startMilliseconds) {
    return {
      normalPrice: input.price,
      effectivePrice: input.price,
      isOnSale: false,
      state: "SCHEDULED",
    };
  }

  if (endMilliseconds !== null && atMilliseconds >= endMilliseconds) {
    return {
      normalPrice: input.price,
      effectivePrice: input.price,
      isOnSale: false,
      state: "EXPIRED",
    };
  }

  return {
    normalPrice: input.price,
    effectivePrice: input.salePrice,
    isOnSale: true,
    state: "ACTIVE",
  };
}
