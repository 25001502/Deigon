"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type FocusEvent } from "react";

import { useCart } from "@/components/cart/cart-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { announcements, collections } from "@/lib/data/catalog";
import {
  announcementAutoplayEnabled,
  announcementInteractionActive,
  nextAnnouncementIndex,
  previousAnnouncementIndex,
  scheduleAnnouncementAdvance,
} from "@/lib/storefront/announcement-rotation";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(reducedMotionQuery);
  mediaQuery.addEventListener("change", onStoreChange);

  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getReducedMotionPreference() {
  return window.matchMedia(reducedMotionQuery).matches;
}

function getServerReducedMotionPreference() {
  return false;
}

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/collections", label: "Collections" },
  ...collections
    .filter((collection) => collection.handle !== "all")
    .map((collection) => ({ href: `/collections/${collection.handle}`, label: collection.title })),
  { href: "/collections/all", label: "All Products" },
];

export function Header() {
  const { itemCount } = useCart();
  const { user, loading } = useAuth();
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [isAnnouncementPaused, setIsAnnouncementPaused] = useState(false);
  const [isAnnouncementHovered, setIsAnnouncementHovered] = useState(false);
  const [isAnnouncementFocusWithin, setIsAnnouncementFocusWithin] = useState(false);
  const [rotationVersion, setRotationVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionPreference,
    getServerReducedMotionPreference,
  );
  const isAnnouncementInteracting = announcementInteractionActive({
    isHovered: isAnnouncementHovered,
    isFocusWithin: isAnnouncementFocusWithin,
  });

  useEffect(() => {
    if (
      !announcementAutoplayEnabled({
        isPaused: isAnnouncementPaused,
        isInteracting: isAnnouncementInteracting,
        prefersReducedMotion,
      })
    ) {
      return;
    }

    return scheduleAnnouncementAdvance(() => {
      setAnnouncementIndex((index) => nextAnnouncementIndex(index, announcements.length));
    });
  }, [isAnnouncementInteracting, isAnnouncementPaused, prefersReducedMotion, rotationVersion]);

  const resetAnnouncementTimer = () => setRotationVersion((version) => version + 1);

  const prev = () => {
    setAnnouncementIndex((index) => previousAnnouncementIndex(index, announcements.length));
    resetAnnouncementTimer();
  };

  const next = () => {
    setAnnouncementIndex((index) => nextAnnouncementIndex(index, announcements.length));
    resetAnnouncementTimer();
  };

  const toggleAnnouncementPause = () => {
    setIsAnnouncementPaused((paused) => !paused);
    resetAnnouncementTimer();
  };

  const handleAnnouncementBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
      setIsAnnouncementFocusWithin(false);
    }
  };

  return (
    <div className="sticky top-0 z-40">
      {/* Announcement bar */}
      <div
        className="relative flex h-10 items-center justify-center bg-neutral-700 px-20 text-center text-xs font-medium text-white"
        onMouseEnter={() => setIsAnnouncementHovered(true)}
        onMouseLeave={() => setIsAnnouncementHovered(false)}
        onFocusCapture={() => setIsAnnouncementFocusWithin(true)}
        onBlurCapture={handleAnnouncementBlur}
      >
        <button
          onClick={prev}
          aria-label="Previous announcement"
          className="absolute left-2 flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          &#8592;
        </button>
        <span
          key={announcementIndex}
          aria-live="off"
          aria-atomic="true"
          className="announcement-message block truncate"
        >
          {announcements[announcementIndex]}
        </span>
        <div className="absolute right-2 flex items-center">
          <button
            type="button"
            onClick={toggleAnnouncementPause}
            aria-label={
              prefersReducedMotion
                ? "Automatic announcements disabled by reduced motion preference"
                : isAnnouncementPaused
                  ? "Resume announcements"
                  : "Pause announcements"
            }
            aria-pressed={isAnnouncementPaused}
            disabled={prefersReducedMotion}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnnouncementPaused ? (
              <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2.5 1.5v9l7-4.5-7-4.5Z" />
              </svg>
            ) : (
              <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2.5 1.5h2.25v9H2.5zm4.75 0H9.5v9H7.25z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next announcement"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            &#8594;
          </button>
        </div>
      </div>

      {/* Main header */}
      <header className="bg-black">
        <div className="relative flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          {/* Left: hamburger + search */}
          <div className="flex items-center gap-5 text-white">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className="flex flex-col gap-1.25"
            >
              <span className="block h-[1.5px] w-6 bg-white" />
              <span className="block h-[1.5px] w-6 bg-white" />
              <span className="block h-[1.5px] w-6 bg-white" />
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
            <Link href={user ? "/account" : "/login"} aria-label={user ? "Account" : "Log in"} className="flex items-center gap-1.5 text-sm text-white">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <span className="hidden sm:inline text-xs">{loading ? "Account" : user ? "Account" : "Log in"}</span>
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

        {menuOpen ? (
          <nav className="border-t border-white/10 bg-black px-4 py-4 sm:px-6 lg:px-8">
            <ul className="mx-auto flex max-w-7xl flex-col gap-1">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-md px-2 py-2 text-sm text-white/85 transition hover:bg-white/10 hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>
    </div>
  );
}
