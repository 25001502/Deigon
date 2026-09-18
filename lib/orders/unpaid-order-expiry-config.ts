import "server-only";

export const MIN_UNPAID_ORDER_TTL_MINUTES = 5;
export const MAX_UNPAID_ORDER_TTL_MINUTES = 10_080;

export class UnpaidOrderExpiryConfigError extends Error {
  constructor() {
    super("Unpaid order expiry is not configured.");
    this.name = "UnpaidOrderExpiryConfigError";
  }
}

export function parseUnpaidOrderTtlMinutes(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) {
    throw new UnpaidOrderExpiryConfigError();
  }

  const ttlMinutes = Number(normalized);
  if (
    !Number.isSafeInteger(ttlMinutes) ||
    ttlMinutes < MIN_UNPAID_ORDER_TTL_MINUTES ||
    ttlMinutes > MAX_UNPAID_ORDER_TTL_MINUTES
  ) {
    throw new UnpaidOrderExpiryConfigError();
  }

  return ttlMinutes;
}

export function getUnpaidOrderTtlMinutes() {
  return parseUnpaidOrderTtlMinutes(process.env.UNPAID_ORDER_TTL_MINUTES);
}
