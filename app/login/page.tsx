import { AuthForm } from "@/components/auth/auth-form";
import { safeCallbackPath } from "@/lib/auth/safe-callback-path";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string | string[] }> }) {
  const params = await searchParams;

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-white px-6 py-20">
      <AuthForm mode="login" error={params.error} message={params.message} next={safeCallbackPath(params.next ?? null)} />
    </main>
  );
}
