import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { AdminSessionControls } from "@/components/admin/admin-session-controls";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/require-user";

export const metadata = { title: "Admin login" };

export default async function AdminLoginPage() {
  let denied = false;
  let isAdmin = false;
  try {
    await requireAdmin();
    isAdmin = true;
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    denied = error.status === 403;
  }
  if (isAdmin) redirect("/admin");

  return (
    <main className="flex min-h-[65vh] items-center justify-center px-4 py-12 sm:px-6">
      <section aria-labelledby="admin-login-title" className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-forest">DEIGON Admin</p>
        <h1 id="admin-login-title" className="mt-3 text-3xl font-semibold text-ink">{denied ? "Admin access required" : "Sign in to admin"}</h1>
        {denied ? (
          <>
            <p role="alert" className="mt-4 text-sm leading-6 text-ink/70">The signed-in account does not have admin access. You can continue to your customer account or sign out to use another account.</p>
            <Link href="/account" className="mt-6 inline-block rounded text-sm font-semibold text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Return to customer account</Link>
            <div className="mt-5"><AdminSessionControls switchAccount /></div>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-6 text-ink/70">Use your existing DEIGON account. Admin access must already be assigned.</p>
            <AdminLoginForm />
          </>
        )}
      </section>
    </main>
  );
}
