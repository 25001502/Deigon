import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { expireUnpaidOrders } from "@/lib/orders/expire-unpaid-orders";
import {
  getUnpaidOrderTtlMinutes,
  UnpaidOrderExpiryConfigError,
} from "@/lib/orders/unpaid-order-expiry-config";

function getMaintenanceSecret() {
  const secret = process.env.DEIGON_MAINTENANCE_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function secretsMatch(actual: string, expected: string) {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export async function POST(request: Request) {
  const maintenanceSecret = getMaintenanceSecret();
  if (!maintenanceSecret) {
    return NextResponse.json(
      { ok: false, message: "Maintenance is not configured." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { ok: false, message: "Maintenance authorization required." },
      { status: 401 },
    );
  }

  const suppliedSecret = authorization.slice("Bearer ".length);
  if (!suppliedSecret || !secretsMatch(suppliedSecret, maintenanceSecret)) {
    return NextResponse.json(
      { ok: false, message: "Maintenance authorization failed." },
      { status: 403 },
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
