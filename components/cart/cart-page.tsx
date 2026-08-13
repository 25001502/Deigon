"use client";

import Image from "next/image";
import Link from "next/link";

import { useCart } from "@/components/cart/cart-provider";
import { MockProductMedia } from "@/components/storefront/mock-product-media";
import { formatRand } from "@/lib/money";

export function CartPage() {
  const { itemCount, items, removeItem, setQuantity, subtotal } = useCart();

  if (items.length === 0) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-5xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">Your cart is empty.</h1>
        <p className="mt-4 max-w-md text-sm leading-7 text-gray-600">
          Browse the collections and add something to your bag.
        </p>
        <Link
          href="/collections/foxygeon-collections"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-black px-7 py-3.5 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Continue shopping
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">
        Your cart ({itemCount} item{itemCount === 1 ? "" : "s"})
      </h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="divide-y divide-gray-200 border-y border-gray-200">
          {items.map((item) => (
            <article key={item.handle} className="grid grid-cols-[96px_1fr] gap-4 py-5 sm:grid-cols-[120px_1fr]">
              <Link href={`/products/${item.handle}`} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                {item.image ? (
                  <Image src={item.image} alt={item.title} fill sizes="120px" className="object-cover" />
                ) : (
                  <MockProductMedia
                    title={item.title}
                    vendor={item.vendor}
                    badge={item.badge}
                    themeClass={item.themeClass}
                    className="h-full min-h-0 rounded-lg p-3"
                  />
                )}
              </Link>

              <div className="flex flex-col justify-between">
                <div>
                  <p className="text-xs text-gray-500">{item.vendor}</p>
                  <Link href={`/products/${item.handle}`} className="mt-1 block text-base font-semibold text-gray-900 hover:underline">
                    {item.title}
                  </Link>
                  <p className="mt-1 text-sm text-gray-600">{formatRand(item.price)} each</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center rounded-full border border-gray-300">
                    <button
                      type="button"
                      aria-label={`Decrease quantity for ${item.title}`}
                      onClick={() => setQuantity(item.handle, item.quantity - 1)}
                      className="h-9 w-9 text-lg text-gray-600 transition hover:text-black"
                    >
                      -
                    </button>
                    <span className="min-w-9 text-center text-sm font-medium text-gray-900">{item.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase quantity for ${item.title}`}
                      onClick={() => setQuantity(item.handle, item.quantity + 1)}
                      className="h-9 w-9 text-lg text-gray-600 transition hover:text-black"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.handle)}
                    className="text-xs font-medium uppercase tracking-wide text-gray-500 underline-offset-2 transition hover:text-black hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>

        <aside className="h-fit rounded-lg border border-gray-200 p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Order summary</p>
          <div className="mt-4 space-y-3 border-b border-gray-200 pb-4 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{formatRand(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Shipping</span>
              <span>Calculated at checkout</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-lg font-semibold text-gray-900">
            <span>Total</span>
            <span>{formatRand(subtotal)}</span>
          </div>
          <p className="mt-4 text-xs leading-6 text-gray-500">
            Free delivery on orders over R600. Pickup available at Univen main gate, usually ready in 24 hours.
          </p>
          <Link
            href="/checkout"
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-black px-6 py-3.5 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Checkout
          </Link>
        </aside>
      </div>
    </main>
  );
}
