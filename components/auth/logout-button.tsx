"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function logOut() {
    const { error } = await createClient().auth.signOut();
    if (!error) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logOut}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
    >
      <LogOut aria-hidden="true" className="h-4 w-4" strokeWidth={1.7} />
      Log out
    </button>
  );
}
