import { prisma } from "@/lib/prisma";
import { AuthError, requireUser } from "@/lib/auth/require-user";

export type AuthorizedAdmin = {
  id: string;
  email: string | null;
  role: "ADMIN";
};

/**
 * Re-derives the caller's role from public."User" using the Supabase-verified UUID.
 * Role is never accepted from the client; it is always looked up server-side.
 * Throws AuthError(401) if unauthenticated, AuthError(403) if authenticated but not ADMIN.
 */
export async function requireAdmin(): Promise<AuthorizedAdmin> {
  const { id, email } = await requireUser();

  const profile = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  });

  if (!profile || profile.role !== "ADMIN") {
    throw new AuthError("Admin privileges required", 403);
  }

  return { id, email, role: "ADMIN" };
}
