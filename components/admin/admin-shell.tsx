import type { ReactNode } from "react";

import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AdminSessionControls } from "@/components/admin/admin-session-controls";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <a href="#admin-content" className="sr-only rounded-xl bg-ink px-4 py-3 text-white focus:not-sr-only focus:inline-block focus:outline-2 focus:outline-offset-4">Skip to admin content</a>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-forest">DEIGON</p>
          <p className="mt-2 text-2xl font-semibold text-ink">Admin workspace</p>
        </div>
        <AdminSessionControls />
      </div>
      <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <AdminNavigation />
        <main id="admin-content" tabIndex={-1} className="min-w-0 rounded-2xl border border-ink/10 bg-white p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
