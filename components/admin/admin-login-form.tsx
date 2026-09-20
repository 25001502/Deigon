"use client";

import { useRef, useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";

export function AdminLoginForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await createClient().auth.signInWithPassword({
        email: String(data.get("email") ?? "").trim(),
        password: String(data.get("password") ?? ""),
      });
      if (result.error) {
        setError("Unable to sign in. Check your email and password and try again.");
      } else {
        // A full navigation gets a fresh server role check and shared auth state.
        // Authentication success alone never grants permission in this component.
        window.location.assign("/admin");
        return;
      }
    } catch {
      setError("Unable to connect. Please try again.");
    }
    submitting.current = false;
    setPending(false);
  }

  return (
    <form onSubmit={submit} aria-busy={pending} className="mt-6 space-y-4">
      {error ? <p id="admin-login-error" role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      <label className="block text-sm font-medium text-ink">
        Email
        <input name="email" type="email" autoComplete="email" required disabled={pending} aria-describedby={error ? "admin-login-error" : undefined} className="mt-2 w-full rounded-xl border border-ink/25 bg-white px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:opacity-60" />
      </label>
      <label className="block text-sm font-medium text-ink">
        Password
        <input name="password" type="password" autoComplete="current-password" required disabled={pending} className="mt-2 w-full rounded-xl border border-ink/25 bg-white px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:opacity-60" />
      </label>
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:opacity-60">{pending ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}
