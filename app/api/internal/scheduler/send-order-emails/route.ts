import { NextResponse } from "next/server";

import { dispatchOrderEmails } from "@/lib/email/dispatch-order-emails";
import { OrderEmailDispatcherConfigurationError } from "@/lib/email/order-email-config";
import { EmailConfigurationError } from "@/lib/email/provider";
import { authorizeOrderEmailSchedulerRequest } from "@/lib/maintenance/authorization";

export async function POST(request: Request) {
  const authorization = authorizeOrderEmailSchedulerRequest(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { ok: false, message: authorization.message },
      { status: authorization.status },
    );
  }

  try {
    const summary = await dispatchOrderEmails({ limit: 2 });
    if (summary.configurationBlocked) {
      return NextResponse.json(
        { ok: false, message: "Email delivery is temporarily unavailable." },
        { status: 503 },
      );
    }
    if (summary.dead > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Order email delivery requires operational attention.",
          summary,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof OrderEmailDispatcherConfigurationError ||
      error instanceof EmailConfigurationError
      ? "Email delivery is not configured."
      : "Email delivery is temporarily unavailable.";
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }
}
