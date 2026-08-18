"use client";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function logOut() {
    const { error } = await createClient().auth.signOut();
    if (!error) router.refresh();
  }

  return (
    <button type="button" onClick={logOut} className="bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-black">
      Log out
    </button>
  );
}
