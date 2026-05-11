"use client";

import Link from "next/link";

import { useCart } from "@/components/cart/cart-provider";
import { MockProductMedia } from "@/components/storefront/mock-product-media";
import { formatRand } from "@/lib/money";

export function CartPage() {
  const { itemCount, items, removeItem, setQuantity, subtotal } = useCart();

  if (items.length === 0) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-5xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Cart preview</p>
        <h1 className="mt-5 font-display text-6xl leading-none text-ink sm:text-7xl">No products yet.</h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-ink/72">
          This page becomes far more convincing once you add a product from the collection or product-detail route.
        </p>
        <Link
          href="/collections/foxygeon-collections"
          className="mt-10 inline-flex items-center justify-center rounded-full bg-ink px-7 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-sand transition hover:bg-forest"
        >
          Browse products
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Cart preview</p>
          <h1 className="mt-4 font-display text-6xl leading-none text-ink sm:text-7xl">
            {itemCount} item{itemCount === 1 ? "" : "s"} ready.
          </h1>
        </div>
        <Link
          href="/checkout"
          className="inline-flex items-center justify-center rounded-full border border-ink/12 px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:border-clay hover:text-clay"
        >
          Continue to checkout demo
        </Link>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-5">
          {items.map((item) => (
            <article
              key={item.handle}
              className="grid gap-5 rounded-[2rem] border border-ink/10 bg-paper p-5 shadow-[0_18px_60px_rgba(15,26,22,0.06)] sm:grid-cols-[220px_1fr]"
            >
              <MockProductMedia
                title={item.title}
                vendor={item.vendor}
                badge={item.badge}
                themeClass={item.themeClass}
                className="min-h-60"
              />

              <div className="flex flex-col justify-between gap-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">{item.vendor}</p>
                  <h2 className="mt-3 text-3xl font-semibold text-ink">{item.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-ink/70">{formatRand(item.price)} each</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center rounded-full border border-ink/10 bg-sand/70 p-1">
                    <button
                      type="button"
                      onClick={() => setQuantity(item.handle, item.quantity - 1)}
                      className="h-10 w-10 rounded-full text-lg text-ink transition hover:bg-paper"
                    >
                      -
                    </button>
                    <span className="min-w-12 text-center text-sm font-semibold text-ink">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(item.handle, item.quantity + 1)}
                      className="h-10 w-10 rounded-full text-lg text-ink transition hover:bg-paper"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.handle)}
                    className="rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-ink/64 transition hover:border-clay hover:text-clay"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>

        <aside className="rounded-[2rem] border border-ink/10 bg-ink px-6 py-7 text-sand shadow-[0_24px_90px_rgba(15,26,22,0.14)] sm:px-7">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sand/60">Order summary</p>
          <div className="mt-6 space-y-4 border-b border-sand/12 pb-6 text-sm text-sand/74">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{formatRand(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Shipping</span>
              <span>Calculated in production</span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between text-lg font-semibold">
            <span>Total</span>
            <span>{formatRand(subtotal)}</span>
          </div>
          <p className="mt-6 text-sm leading-7 text-sand/72">
            In production this panel will confirm shipping rules, pickup availability, and the real Yoco payment handoff.
          </p>
          <Link
            href="/checkout"
            className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-sand px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:bg-white"
          >
            Open checkout demo
          </Link>
        </aside>
      </div>
    </main>
  );
}