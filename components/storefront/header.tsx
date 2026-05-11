"use client";

import Link from "next/link";
import { useState } from "react";

import { useCart } from "@/components/cart/cart-provider";
import { announcements } from "@/lib/data/catalog";

export function Header() {
  const { itemCount } = useCart();
  const [announcementIndex, setAnnouncementIndex] = useState(0);

  const prev = () => setAnnouncementIndex((i) => (i - 1 + announcements.length) % announcements.length);
  const next = () => setAnnouncementIndex((i) => (i + 1) % announcements.length);

  return (
    <div className="sticky top-0 z-40">
      {/* Announcement bar */}
      <div className="relative flex items-center justify-center bg-neutral-700 py-2.5 text-center text-xs font-medium text-white">
        <button
          onClick={prev}
          aria-label="Previous announcement"
          className="absolute left-4 text-white/70 hover:text-white transition"
        >
          &#8592;
        </button>
        <span>{announcements[announcementIndex]}</span>
        <button
          onClick={next}
          aria-label="Next announcement"
          className="absolute right-4 text-white/70 hover:text-white transition"
        >
          &#8594;
        </button>
      </div>

      {/* Main header */}
      <header className="bg-black">
        <div className="relative flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          {/* Left: hamburger + search */}
          <div className="flex items-center gap-5 text-white">
            <button aria-label="Menu" className="flex flex-col gap-1.25">
              <span className="block h-[1.5px] w-6 bg-white" />
              <span className="block h-[1.5px] w-6 bg-white" />
              <span className="block h-[1.5px] w-6 bg-white" />
            </button>
            <button aria-label="Search" className="text-white">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>

          {/* Center: DEIGON wordmark */}
          <Link
            href="/"
            className="absolute left-1/2 -translate-x-1/2 font-sans text-3xl font-bold tracking-[0.3em] text-white sm:text-4xl"
          >
            DEIGON
          </Link>

          {/* Right: account + cart */}
          <div className="flex items-center gap-5 text-white">
            <Link href="#" aria-label="Log in" className="flex items-center gap-1.5 text-sm text-white">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <span className="hidden sm:inline text-xs">Log in</span>
            </Link>
            <Link
              href="/cart"
              aria-label={`Cart ${itemCount} item${itemCount !== 1 ? "s" : ""}`}
              suppressHydrationWarning
              className="relative flex items-center gap-1.5"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <span className="hidden sm:inline text-xs">Cart</span>
              <span
                suppressHydrationWarning
                className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black"
              >
                {itemCount}
              </span>
            </Link>
          </div>
        </div>
      </header>
    </div>
  );
}