import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-white px-6 py-20">
      <AuthForm mode="login" error={params.error} message={params.message} />
    </main>
  );
}