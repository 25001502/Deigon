import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 180;
const MAX_RAW_BODY_BYTES = 256 * 1024;

export type VerifyYocoWebhookInput = {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
};

export type YocoWebhookVerificationErrorCode =
  | "CONFIGURATION"
  | "INVALID_WEBHOOK"
  | "INVALID_PAYLOAD";

export class YocoWebhookVerificationError extends Error {
  constructor(
    public readonly code: YocoWebhookVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "YocoWebhookVerificationError";
  }
}

function decodeBase64(value: string) {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return null;
  }

  const decoded = Buffer.from(value, "base64");
  return decoded.length > 0 && decoded.toString("base64") === value
    ? decoded
    : null;
}

function loadWebhookSecret() {
  const value = process.env.YOCO_WEBHOOK_SECRET?.trim();
  if (!value?.startsWith("whsec_")) {
    throw new YocoWebhookVerificationError(
      "CONFIGURATION",
      "Yoco webhook verification is not configured.",
    );
  }

  const secret = decodeBase64(value.slice("whsec_".length));
  if (!secret) {
    throw new YocoWebhookVerificationError(
      "CONFIGURATION",
      "Yoco webhook verification is not configured.",
    );
  }
  return secret;
}

function invalidWebhook(): never {
  throw new YocoWebhookVerificationError(
    "INVALID_WEBHOOK",
    "Webhook verification failed.",
  );
}

export function verifyYocoWebhook(input: VerifyYocoWebhookInput): unknown {
  if (
    Buffer.byteLength(input.rawBody, "utf8") > MAX_RAW_BODY_BYTES ||
    !input.webhookId ||
    input.webhookId.length > 255 ||
    !input.webhookTimestamp ||
    !input.webhookSignature
  ) {
    return invalidWebhook();
  }

  if (!/^(0|[1-9]\d*)$/.test(input.webhookTimestamp)) {
    return invalidWebhook();
  }
  const timestamp = Number(input.webhookTimestamp);
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0 ||
    Math.abs(now - timestamp) > MAX_AGE_SECONDS
  ) {
    return invalidWebhook();
  }

  const entries = input.webhookSignature.split(" ");
  if (
    entries.length === 0 ||
    entries.some((entry) => !/^v\d+,[A-Za-z0-9+/]+={0,2}$/.test(entry))
  ) {
    return invalidWebhook();
  }

  const expected = createHmac("sha256", loadWebhookSecret())
    .update(`${input.webhookId}.${input.webhookTimestamp}.${input.rawBody}`, "utf8")
    .digest();

  let matched = false;
  for (const entry of entries) {
    const [version, encodedSignature] = entry.split(",", 2);
    if (version !== "v1") continue;

    const signature = decodeBase64(encodedSignature);
    if (
      signature &&
      signature.length === expected.length &&
      timingSafeEqual(signature, expected)
    ) {
      matched = true;
    }
  }
  if (!matched) return invalidWebhook();

  try {
    return JSON.parse(input.rawBody) as unknown;
  } catch {
    throw new YocoWebhookVerificationError(
      "INVALID_PAYLOAD",
      "Webhook body must be valid JSON.",
    );
  }
}
