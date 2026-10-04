import { NextResponse } from "next/server";

import { authorizeMaintenanceRequest } from "@/lib/maintenance/authorization";
import { expireUnpaidOrders } from "@/lib/orders/expire-unpaid-orders";
import {
  getUnpaidOrderTtlMinutes,
  UnpaidOrderExpiryConfigError,
} from "@/lib/orders/unpaid-order-expiry-config";

export async function POST(request: Request) {
  const authorization = authorizeMaintenanceRequest(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { ok: false, message: authorization.message },
      { status: authorization.status },
    );
  }

  try {
    const ttlMinutes = getUnpaidOrderTtlMinutes();
    const summary = await expireUnpaidOrders({ ttlMinutes });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof UnpaidOrderExpiryConfigError
      ? "Maintenance is not configured."
      : "Maintenance is temporarily unavailable.";
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }
}
