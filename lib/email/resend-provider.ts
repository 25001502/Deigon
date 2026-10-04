import "server-only";

import { Resend } from "resend";
import {
  DEIGON_ORDER_EMAIL_SENDER,
  EmailConfigurationError,
  type EmailProvider,
  type EmailProviderFailure,
  type EmailProviderFailureKind,
  type EmailProviderSendInput,
  type EmailProviderSuccess,
} from "./provider";

type ResendClientError = {
  name?: unknown;
  statusCode?: unknown;
  message?: unknown;
};

type ResendClientResponse = {
  data: { id?: unknown } | null;
  error: ResendClientError | null;
  headers?: Record<string, string> | null;
};

export type ResendEmailClient = {
  emails: {
    send(
      payload: { from: string; to: string; subject: string; html: string; text: string },
      options: { idempotencyKey: string; signal?: AbortSignal },
    ): Promise<ResendClientResponse>;
  };
};

const CONFIGURATION_CODES = new Set([
  "missing_api_key",
  "invalid_api_key",
  "restricted_api_key",
  "invalid_from_address",
  "invalid_region",
  "invalid_access",
  "security_error",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
]);

const RETRYABLE_CODES = new Set([
  "rate_limit_exceeded",
  "internal_server_error",
  "application_error",
  "concurrent_idempotent_requests",
]);

const PERMANENT_CODES = new Set([
  "invalid_idempotency_key",
  "validation_error",
  "invalid_attachment",
  "invalid_parameter",
  "missing_required_field",
  "not_found",
  "method_not_allowed",
]);

function statusCode(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599
    ? value as number
    : null;
}

function retryAfter(headers: Record<string, string> | null | undefined): number | null {
  if (!headers) return null;
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === "retry-after");
  if (!entry || !/^[1-9]\d*$/.test(entry[1])) return null;
  const seconds = Number(entry[1]);
  return Number.isSafeInteger(seconds) && seconds <= 86_400 ? seconds : null;
}

function knownCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (
    CONFIGURATION_CODES.has(value) ||
    RETRYABLE_CODES.has(value) ||
    PERMANENT_CODES.has(value) ||
    value === "invalid_idempotent_request"
  ) return value;
  return null;
}

function failureKind(code: string | null, status: number | null): EmailProviderFailureKind {
  if (code === "invalid_idempotent_request") return "IDEMPOTENCY_CONFLICT";
  if (code && CONFIGURATION_CODES.has(code)) return "CONFIGURATION";
  if (status === 401 || status === 403) return "CONFIGURATION";
  if (code && RETRYABLE_CODES.has(code)) return "RETRYABLE";
  if (code && PERMANENT_CODES.has(code)) return "PERMANENT";
  if (status === null || status === 408 || status === 425 || status === 429 || status >= 500) {
    return "RETRYABLE";
  }
  return "PERMANENT";
}

function normalizeFailure(
  error: ResendClientError,
  headers?: Record<string, string> | null,
): EmailProviderFailure {
  const status = statusCode(error.statusCode);
  const code = knownCode(error.name);
  return {
    ok: false,
    kind: failureKind(code, status),
    code: code ?? (status === null ? "provider_error" : `http_${status}`),
    statusCode: status,
    retryAfterSeconds: retryAfter(headers),
  };
}

export function createResendEmailProviderFromClient(client: ResendEmailClient): EmailProvider {
  return {
    async send(input: EmailProviderSendInput): Promise<EmailProviderSuccess | EmailProviderFailure> {
      try {
        const response = await client.emails.send(
          {
            from: DEIGON_ORDER_EMAIL_SENDER,
            to: input.to,
            subject: input.subject,
            html: input.html,
            text: input.text,
          },
          {
            idempotencyKey: input.idempotencyKey,
            ...(input.signal ? { signal: input.signal } : {}),
          },
        );
        if (response.error) return normalizeFailure(response.error, response.headers);
        const providerMessageId = typeof response.data?.id === "string" ? response.data.id.trim() : "";
        if (!providerMessageId) {
          return {
            ok: false,
            kind: "RETRYABLE",
            code: "invalid_provider_response",
            statusCode: null,
            retryAfterSeconds: null,
          };
        }
        return { ok: true, providerMessageId };
      } catch {
        return {
          ok: false,
          kind: "RETRYABLE",
          code: "network_error",
          statusCode: null,
          retryAfterSeconds: null,
        };
      }
    },
  };
}

export function createResendEmailProvider(
  readApiKey: () => string | undefined = () => process.env.RESEND_API_KEY,
): EmailProvider {
  const apiKey = readApiKey()?.trim();
  if (!apiKey) throw new EmailConfigurationError();
  const resend = new Resend(apiKey);
  return createResendEmailProviderFromClient({
    emails: {
      send: (payload, options) => resend.emails.send(payload, options),
    },
  });
}
