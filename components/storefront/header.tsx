"use client";

import Link from "next/link";

import { useCart } from "@/components/cart/cart-provider";
import { collections } from "@/lib/data/catalog";

export function Header() {
  const { itemCount } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-display text-4xl leading-none text-ink">
            Deigon
          </Link>
          <nav className="hidden items-center gap-5 lg:flex">
            {collections.map((collection) => (
              <Link
                key={collection.handle}
                href={`/collections/${collection.handle}`}
                className="text-sm font-semibold uppercase tracking-[0.2em] text-ink/60 transition hover:text-ink"
              >
                {collection.title}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/checkout"
            className="hidden rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-ink/70 transition hover:border-clay hover:text-clay sm:inline-flex"
          >
            Checkout preview
          </Link>
          <Link
            href="/cart"
            className="inline-flex items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.24em] text-sand transition hover:bg-forest"
          >
            Cart
            <span
              suppressHydrationWarning
              className="rounded-full border border-sand/20 px-2 py-1 text-[10px] leading-none text-sand/80"
            >
              {itemCount}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}