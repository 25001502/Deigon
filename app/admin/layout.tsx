import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./admin.css";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Applies to login too. Protected pages additionally verify identity and role.
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-theme min-h-screen bg-neutral-50 text-neutral-950">{children}</div>;
}
