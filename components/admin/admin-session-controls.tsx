"use client";

import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function AdminSessionControls({ switchAccount = false }: { switchAccount?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  async function signOut() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await createClient().auth.signOut();
      if (result.error) {
        setError("Unable to sign out. Please try again.");
      } else {
        window.location.assign("/admin/login");
        return;
      }
    } catch {
      setError("Unable to sign out. Please try again.");
    }
    submitting.current = false;
    setPending(false);
  }

  return (
    <div>
      <button type="button" onClick={signOut} disabled={pending} aria-busy={pending} className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-950 disabled:opacity-60">{pending ? "Signing out..." : switchAccount ? "Sign out / switch account" : "Sign out"}</button>
      {error ? <p role="alert" className="mt-3 text-sm text-neutral-900">{error}</p> : null}
    </div>
  );
}
