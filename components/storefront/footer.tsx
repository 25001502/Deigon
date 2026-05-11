"use client";

import Link from "next/link";

export function Footer() {
  return (
    <>
      {/* Email subscribe section */}
      <section className="border-t border-gray-200 bg-white py-14 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Subscribe to our emails</h2>
        <p className="mt-2 text-sm text-gray-600">
          Be the first to know about new collections and exclusive offers.
        </p>
        <form
          className="mx-auto mt-6 flex max-w-sm items-center gap-2 px-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            type="email"
            placeholder="Email"
            aria-label="Email address"
            className="flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-600 focus:ring-1 focus:ring-gray-600"
          />
          <button
            type="submit"
            className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Subscribe
          </button>
        </form>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-3 text-xs text-gray-500 sm:flex-row sm:justify-between">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span>© 2026, Deigon</span>
              <span aria-hidden>·</span>
              <Link href="#" className="hover:text-gray-900 transition">
                Powered by Deigon Commerce
              </Link>
            </div>
            <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              <Link href="#" className="hover:text-gray-900 transition">Privacy policy</Link>
              <Link href="#" className="hover:text-gray-900 transition">Refund policy</Link>
              <Link href="#" className="hover:text-gray-900 transition">Shipping policy</Link>
              <Link href="#" className="hover:text-gray-900 transition">Terms of service</Link>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}