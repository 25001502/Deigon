import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { errorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

// Demonstrates the authorization layer: no session -> 401, CUSTOMER -> 403, ADMIN -> 200.
export async function GET() {
  try {
    const admin = await requireAdmin();
    return noStore(NextResponse.json({ ok: true, message: "Admin access granted", adminId: admin.id }));
  } catch (error) {
    return noStore(errorResponse(error));
  }
}
