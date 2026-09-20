"use client";

import Link from "next/link";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-ink">Admin is temporarily unavailable</h1>
      <p role="alert" className="mt-4 text-sm text-ink/70">We could not complete your request. Please try again.</p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" onClick={reset} className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">Try again</button>
        <Link href="/account" className="rounded text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Return to account</Link>
      </div>
    </main>
  );
}
