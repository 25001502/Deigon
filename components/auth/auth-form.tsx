"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type AuthFormProps = {
  mode: "login" | "signup";
  error?: string;
  message?: string;
};

export function AuthForm({ mode, error, message }: AuthFormProps) {
  const isLogin = mode === "login";
  const router = useRouter();
  const [formError, setFormError] = useState(error);
  const [formMessage, setFormMessage] = useState(message);
  const [submitting, setSubmitting] = useState(false);

  async function submit(formData: FormData) {
    setSubmitting(true);
    setFormError(undefined);
    setFormMessage(undefined);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const supabase = createClient();
    const result = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });

    if (result.error) {
      setFormError(result.error.message);
      setSubmitting(false);
      return;
    }

    if (!isLogin && !result.data.session) {
      setFormMessage("Check your email to confirm your account");
      setSubmitting(false);
      return;
    }

    router.refresh();
    router.push("/account");
  }

  return (
    <div className="w-full max-w-md bg-transparent p-8 sm:p-12">
      <div className="mb-8">
        <h1 className=" text-5xl font-bold leading-none text-ink">{isLogin ? "Welcome back." : "Make it yours."}</h1>
        <p className="mt-4 text-sm leading-6 text-ink/65">
          {isLogin ? "Sign in to see your account and keep your orders close." : "Create an account to keep your orders and details together."}
        </p>
      </div>

      {formError ? <p className="mb-4 border border-white bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p> : null}
      {formMessage ? <p className="mb-4 border border-forest/20 bg-forest/5 px-4 py-3 text-sm text-black">{formMessage}</p> : null}

      <form action={submit} className="space-y-4">
        <label className="block text-sm font-medium text-ink ">
          Email
          <input name="email" type="email" autoComplete="email" required className="mt-2 w-full border border-ink/20 bg-white px-4 py-3 outline-none transition focus:border-ink rounded-xl" />
        </label>
        <label className="block text-sm font-medium text-ink">
          Password
          <input name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} minLength={6} required className="mt-2 w-full border border-ink/20 bg-white px-4 py-3 outline-none transition focus:border-ink rounded-xl" />
        </label>
        <button type="submit" disabled={submitting} className="w-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-black rounded-xl disabled:opacity-60">
          {submitting ? "Please wait..." : isLogin ? "Log in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink/65">
        {isLogin ? "New to Deigon? " : "Already have an account? "}
        <Link href={isLogin ? "/signup" : "/login"} className="font-semibold text-ink underline underline-offset-4">
          {isLogin ? "Create an account" : "Log in"}
        </Link>
      </p>
    </div>
  );
}