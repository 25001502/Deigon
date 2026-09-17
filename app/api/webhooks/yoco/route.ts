import { NextResponse } from "next/server";

import {
  processYocoWebhook,
  YocoWebhookProcessingError,
} from "@/lib/payments/process-yoco-webhook";
import {
  verifyYocoWebhook,
  YocoWebhookVerificationError,
} from "@/lib/payments/yoco-webhook";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const event = verifyYocoWebhook({
      rawBody,
      webhookId: request.headers.get("webhook-id"),
      webhookTimestamp: request.headers.get("webhook-timestamp"),
      webhookSignature: request.headers.get("webhook-signature"),
    });
    const result = await processYocoWebhook(event);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof YocoWebhookVerificationError) {
      const status = error.code === "CONFIGURATION"
        ? 503
        : error.code === "INVALID_PAYLOAD"
          ? 400
          : 403;
      return NextResponse.json({ ok: false, message: error.message }, { status });
    }
    if (error instanceof YocoWebhookProcessingError) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, message: "Webhook processing temporarily unavailable." },
      { status: 503 },
    );
  }
}
