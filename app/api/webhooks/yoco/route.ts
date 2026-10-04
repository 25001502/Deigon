import { after, NextResponse } from "next/server";

import { dispatchOrderEmails } from "@/lib/email/dispatch-order-emails";
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
    if (result === "processed") {
      after(async () => {
        try {
          const summary = await dispatchOrderEmails({ limit: 1 });
          if (summary.dead > 0) {
            console.error("Order email background dispatch dead-lettered events.", {
              examined: summary.examined,
              dead: summary.dead,
            });
          }
        } catch {
          console.error("Order email background dispatch failed.");
        }
      });
    }
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
