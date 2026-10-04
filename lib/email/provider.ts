import "server-only";

export const DEIGON_ORDER_EMAIL_SENDER = "DEIGON <orders@deigon.co.za>";
export const ORDER_EMAIL_PROVIDER_IDEMPOTENCY_PREFIX = "deigon/order-email/v1/";

export type EmailProviderSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  signal?: AbortSignal;
};

export type EmailProviderSuccess = {
  ok: true;
  providerMessageId: string;
};

export type EmailProviderFailureKind =
  | "RETRYABLE"
  | "PERMANENT"
  | "CONFIGURATION"
  | "IDEMPOTENCY_CONFLICT";

export type EmailProviderFailure = {
  ok: false;
  kind: EmailProviderFailureKind;
  code: string;
  statusCode: number | null;
  retryAfterSeconds: number | null;
};

export type EmailProviderResult = EmailProviderSuccess | EmailProviderFailure;

export interface EmailProvider {
  send(input: EmailProviderSendInput): Promise<EmailProviderResult>;
}

export class EmailConfigurationError extends Error {
  constructor() {
    super("Email provider is not configured.");
    this.name = "EmailConfigurationError";
  }
}

export function orderEmailProviderIdempotencyKey(outboxId: string): string {
  if (
    typeof outboxId !== "string" ||
    outboxId.length === 0 ||
    /[\u0000-\u0020\u007f]/.test(outboxId)
  ) {
    throw new Error("Outbox ID is invalid for provider idempotency.");
  }
  const key = `${ORDER_EMAIL_PROVIDER_IDEMPOTENCY_PREFIX}${outboxId}`;
  if (key.length > 256) throw new Error("Provider idempotency key is too long.");
  return key;
}
