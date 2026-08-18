import { createClient } from "@/lib/supabase/server";

export class AuthError extends Error {
  constructor(message: string, public readonly status: 401 | 403) {
    super(message);
    this.name = "AuthError";
  }
}

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

/**
 * Resolves the caller's identity from the server-side Supabase session (cookies verified
 * against Supabase Auth). Throws AuthError(401) if there is no authenticated session.
 * Never trust a user id/role passed via request body, query/URL params, or client cookies.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError("Authentication required", 401);
  }

  return { id: user.id, email: user.email ?? null };
}
