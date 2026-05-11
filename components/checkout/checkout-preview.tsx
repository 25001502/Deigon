"use client";

import Link from "next/link";

import { useCart } from "@/components/cart/cart-provider";
import { formatRand } from "@/lib/money";

const inputClassName =
  "mt-2 w-full rounded-[1.2rem] border border-ink/10 bg-sand/70 px-4 py-3 text-sm text-ink outline-none transition focus:border-clay";

export function CheckoutPreview() {
  const { items, subtotal } = useCart();

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Checkout prototype</p>
          <h1 className="mt-4 font-display text-6xl leading-none text-ink sm:text-7xl">
            A calmer handoff to payment.
          </h1>
        </div>
        <div className="rounded-full border border-clay/20 bg-clay/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-clay">
          Demo only: no real payment submission
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6 rounded-[2.2rem] border border-ink/10 bg-paper px-6 py-7 shadow-[0_24px_90px_rgba(15,26,22,0.08)] sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Contact</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-ink/72">
                First name
                <input className={inputClassName} placeholder="Thando" />
              </label>
              <label className="text-sm font-medium text-ink/72">
                Last name
                <input className={inputClassName} placeholder="N" />
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-ink/72">
              Email
              <input className={inputClassName} placeholder="you@example.com" type="email" />
            </label>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Delivery</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-ink/72">
                City
                <input className={inputClassName} placeholder="Thohoyandou" />
              </label>
              <label className="text-sm font-medium text-ink/72">
                Province
                <input className={inputClassName} placeholder="Limpopo" />
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-ink/72">
              Address
              <input className={inputClassName} placeholder="Street address" />
            </label>
            <div className="mt-4 rounded-3xl border border-ink/10 bg-sand/80 p-4 text-sm leading-7 text-ink/72">
              Free delivery activates over R600. Pickup can be surfaced here as a second option once the production flow is connected.
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Payment</p>
            <div className="mt-4 rounded-[1.75rem] border border-ink/10 bg-ink px-5 py-5 text-sand">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Yoco</h2>
                  <p className="mt-2 text-sm leading-7 text-sand/72">
                    The production build will redirect here for a real payment handoff once the owner approves the storefront.
                  </p>
                </div>
                <div className="rounded-full border border-sand/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sand/65">
                  Planned gateway
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-[2.2rem] border border-ink/10 bg-paper px-6 py-7 shadow-[0_24px_90px_rgba(15,26,22,0.08)] sm:px-7">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Order summary</p>

          {items.length === 0 ? (
            <div className="mt-6 rounded-[1.75rem] border border-dashed border-ink/15 bg-sand/50 p-6">
              <p className="text-lg font-semibold text-ink">Your demo cart is empty.</p>
              <p className="mt-3 text-sm leading-7 text-ink/70">
                Add a product first so the owner can see a more convincing checkout summary.
              </p>
              <Link
                href="/collections/foxygeon-collections"
                className="mt-6 inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-sand transition hover:bg-forest"
              >
                Browse products
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {items.map((item) => (
                <div key={item.handle} className="flex items-center justify-between gap-4 border-b border-ink/10 pb-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.22em] text-ink/48">
                      Qty {item.quantity}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ink">
                    {formatRand(item.price * item.quantity)}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between text-base text-ink/72">
                <span>Subtotal</span>
                <span>{formatRand(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-base text-ink/72">
                <span>Shipping</span>
                <span>Calculated later</span>
              </div>
              <div className="flex items-center justify-between text-xl font-semibold text-ink">
                <span>Total</span>
                <span>{formatRand(subtotal)}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-ink px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-sand transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
            disabled={items.length === 0}
          >
            Continue to Yoco in production
          </button>

          <p className="mt-4 text-sm leading-7 text-ink/68">
            This button stays non-functional in the pitch build. The point is to show the buyer journey, not fake a real payment flow.
          </p>
        </aside>
      </div>
    </main>
  );
}