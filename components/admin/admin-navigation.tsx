"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/inventory", label: "Inventory" },
];

export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin navigation">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
        {links.map(({ href, label }) => {
          const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
          return (
            <li key={href}>
              <Link href={href} prefetch={false} aria-current={active ? "page" : undefined} className={`block rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest ${active ? "bg-ink text-white" : "text-ink/75 hover:bg-sand"}`}>{label}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
