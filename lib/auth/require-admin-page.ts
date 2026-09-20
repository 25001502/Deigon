import "server-only";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/require-user";

// Each protected page calls this as well as its layout. Never cache role decisions
// across requests, and never turn an unexpected database failure into permission.
export async function requireAdminPage() {
  try {
    return await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(error.status === 401 ? "/admin/login" : "/admin/login?access=denied");
    }
    throw error;
  }
}
