import "server-only";

import { Prisma } from "@prisma/client";

const CHECKOUT_URL = "https://payments.yoco.com/api/checkouts";
const REQUEST_TIMEOUT_MS = 15_000;

export type CreateYocoCheckoutInput = {
  /** Authoritative order total in rand, not cents. */
  amount: Prisma.Decimal;
  /** Stable per order, e.g. deigon-yoco-<order-id>; reuse for retries. */
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
  failureUrl: string;
  metadata?: Record<string, string>;
  externalId?: string;
};

export type YocoCheckout = {
  checkoutId: string;
  redirectUrl: string;
};

export type YocoCheckoutErrorCode =
  | "CONFIGURATION"
  | "INVALID_INPUT"
  | "NETWORK"
  | "TIMEOUT"
  | "PROVIDER"
  | "INVALID_RESPONSE";

export class YocoCheckoutError extends Error {
  constructor(
    public readonly code: YocoCheckoutErrorCode,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "YocoCheckoutError";
  }
}

export function decimalToCents(amount: Prisma.Decimal): number {
  if (
    !Prisma.Decimal.isDecimal(amount) ||
    !amount.isFinite() ||
    !amount.gt(0) ||
    amount.decimalPlaces() > 2
  ) {
    throw new YocoCheckoutError(
      "INVALID_INPUT",
      "Payment amount must be positive with at most two decimal places.",
    );
  }
  if (amount.gt("90071992547409.91")) {
    throw new YocoCheckoutError("INVALID_INPUT", "Payment amount exceeds the supported cents range.");
  }

  // Precision is checked first: toFixed pads but cannot round this amount.
  // Convert only the resulting integer string, never a floating-point rand value.
  const cents = Number(amount.toFixed(2).replace(".", ""));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new YocoCheckoutError("INVALID_INPUT", "Payment amount exceeds the supported cents range.");
  }
  return cents;
}

function isHttpUrl(value: unknown, httpsOnly = false): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || (!httpsOnly && url.protocol === "http:")) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** Call outside database transactions; this module does not read or write the database. */
export async function createYocoCheckout(input: CreateYocoCheckoutInput): Promise<YocoCheckout> {
  const secretKey = process.env.YOCO_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new YocoCheckoutError("CONFIGURATION", "YOCO_SECRET_KEY is not configured.");
  }

  const amount = decimalToCents(input.amount);
  if (
    typeof input.idempotencyKey !== "string" ||
    !/^[\x21-\x7E]+$/.test(input.idempotencyKey)
  ) {
    throw new YocoCheckoutError("INVALID_INPUT", "A non-empty, header-safe idempotency key is required.");
  }
  if (![input.successUrl, input.cancelUrl, input.failureUrl].every((url) => isHttpUrl(url))) {
    throw new YocoCheckoutError("INVALID_INPUT", "Valid absolute checkout return URLs are required.");
  }

  let body: string;
  try {
    body = JSON.stringify({
      amount,
      currency: "ZAR",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      failureUrl: input.failureUrl,
      metadata: input.metadata,
      externalId: input.externalId,
    });
  } catch {
    throw new YocoCheckoutError("INVALID_INPUT", "Checkout details could not be serialized.");
  }

  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(CHECKOUT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal,
    });
  } catch {
    // Do not attach the original error: it may contain credentials or request details.
    throw new YocoCheckoutError(
      signal.aborted ? "TIMEOUT" : "NETWORK",
      signal.aborted ? "Yoco checkout request timed out." : "Yoco checkout could not be reached.",
    );
  }

  if (!response.ok) {
    throw new YocoCheckoutError("PROVIDER", "Yoco rejected the checkout request.", response.status);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new YocoCheckoutError(
      signal.aborted ? "TIMEOUT" : "INVALID_RESPONSE",
      signal.aborted ? "Yoco checkout request timed out." : "Yoco returned an unreadable checkout response.",
    );
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("id" in data) ||
    typeof data.id !== "string" ||
    !data.id.trim() ||
    !("redirectUrl" in data) ||
    !isHttpUrl(data.redirectUrl, true)
  ) {
    throw new YocoCheckoutError("INVALID_RESPONSE", "Yoco returned invalid checkout details.");
  }

  return { checkoutId: data.id, redirectUrl: data.redirectUrl };
}
