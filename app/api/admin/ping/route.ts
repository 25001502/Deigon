import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/require-user";

// Demonstrates the authorization layer: no session -> 401, CUSTOMER -> 403, ADMIN -> 200.
export async function GET() {
  try {
    const admin = await requireAdmin();
    return NextResponse.json({ ok: true, message: "Admin access granted", adminId: admin.id });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
