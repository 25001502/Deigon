import "server-only";

export const ORDER_EMAIL_MAX_ATTEMPTS = 8;
export const ORDER_EMAIL_RETRY_DELAYS_SECONDS = [
  60,
  5 * 60,
  15 * 60,
  60 * 60,
  3 * 60 * 60,
  6 * 60 * 60,
  12 * 60 * 60,
] as const;

export function orderEmailRetryDelaySeconds(
  attemptCount: number,
  retryAfterSeconds: number | null,
): number {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1 || attemptCount >= ORDER_EMAIL_MAX_ATTEMPTS) {
    throw new Error("Order email attempt is not retryable.");
  }
  if (
    retryAfterSeconds !== null &&
    (!Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds < 1 || retryAfterSeconds > 86_400)
  ) {
    throw new Error("Order email Retry-After value is invalid.");
  }
  return Math.max(
    ORDER_EMAIL_RETRY_DELAYS_SECONDS[attemptCount - 1],
    retryAfterSeconds ?? 0,
  );
}

export function nextOrderEmailAttemptAt(
  now: Date,
  attemptCount: number,
  retryAfterSeconds: number | null,
): Date {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Order email retry clock is invalid.");
  }
  return new Date(now.getTime() + orderEmailRetryDelaySeconds(attemptCount, retryAfterSeconds) * 1000);
}
