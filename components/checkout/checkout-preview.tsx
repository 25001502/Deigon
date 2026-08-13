"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useCart } from "@/components/cart/cart-provider";
import { formatRand } from "@/lib/money";
import { storeInfo } from "@/lib/data/catalog";

const inputClassName =
  "mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-black focus:ring-1 focus:ring-black";

const FREE_DELIVERY_THRESHOLD = 600;
const FLAT_DELIVERY_FEE = 80;

function generateOrderReference() {
  return `DGN-${Date.now().toString(36).toUpperCase()}`;
}

export function CheckoutPreview() {
  const { items, subtotal, clearCart } = useCart();
  const [fulfilment, setFulfilment] = useState<"delivery" | "pickup">("delivery");
  const [orderReference, setOrderReference] = useState<string | null>(null);

  const shipping = useMemo(() => {
    if (fulfilment === "pickup") {
      return 0;
    }

    return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : FLAT_DELIVERY_FEE;
  }, [fulfilment, subtotal]);

  const total = subtotal + shipping;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (items.length === 0) {
      return;
    }

    const reference = generateOrderReference();
    setOrderReference(reference);
    clearCart();
  };

  if (orderReference) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">&#10003;</span>
        <h1 className="mt-6 text-3xl font-bold text-gray-900">Order received</h1>
        <p className="mt-3 text-sm text-gray-600">
          Reference <span className="font-semibold text-gray-900">{orderReference}</span>
        </p>
        <p className="mt-6 max-w-md text-sm leading-7 text-gray-600">
          We&apos;ll email you a Yoco payment request to complete this order. Once payment is confirmed we&apos;ll get
          it {fulfilment === "pickup" ? `ready for pickup at ${storeInfo.pickupLocation}` : "packed for delivery"} within
          5–10 business days.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-black px-7 py-3.5 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-8 rounded-lg border border-gray-200 p-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Contact</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                First name
                <input required className={inputClassName} name="firstName" placeholder="First name" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Last name
                <input required className={inputClassName} name="lastName" placeholder="Last name" />
              </label>
            </div>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Email
              <input required className={inputClassName} name="email" placeholder="you@example.com" type="email" />
            </label>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Phone
              <input required className={inputClassName} name="phone" placeholder="082 000 0000" type="tel" />
            </label>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Fulfilment</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setFulfilment("delivery")}
                className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                  fulfilment === "delivery" ? "border-black bg-black text-white" : "border-gray-300 text-gray-700 hover:border-black"
                }`}
              >
                Delivery
                <span className="mt-1 block text-xs font-normal opacity-80">R80 flat fee, free over R600</span>
              </button>
              <button
                type="button"
                onClick={() => setFulfilment("pickup")}
                className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                  fulfilment === "pickup" ? "border-black bg-black text-white" : "border-gray-300 text-gray-700 hover:border-black"
                }`}
              >
                Pickup
                <span className="mt-1 block text-xs font-normal opacity-80">{storeInfo.pickupLocation}, ready in 24 hours</span>
              </button>
            </div>

            {fulfilment === "delivery" ? (
              <div className="mt-4 space-y-4">
                <label className="block text-sm font-medium text-gray-700">
                  Address
                  <input required className={inputClassName} name="address" placeholder="Street address" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700">
                    City
                    <input required className={inputClassName} name="city" placeholder="City" />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Province
                    <input required className={inputClassName} name="province" placeholder="Province" />
                  </label>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-600">
                  Orders are processed and shipped within 5–10 business days. Free delivery around Thohoyandou.
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-600">
                {storeInfo.pickupLocation}
                <br />
                {storeInfo.addressLines.join(", ")}
                <br />
                {storeInfo.phone}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Payment</h2>
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-5">
              <h3 className="text-base font-semibold text-gray-900">Yoco</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                After you place your order we&apos;ll send a secure Yoco payment request to your email to complete
                the transaction.
              </p>
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-gray-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Order summary</h2>

          {items.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-6">
              <p className="text-base font-semibold text-gray-900">Your cart is empty.</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">Add a product before checking out.</p>
              <Link
                href="/collections/foxygeon-collections"
                className="mt-4 inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
              >
                Browse products
              </Link>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {items.map((item) => (
                <div key={item.handle} className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">Qty {item.quantity}</p>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {formatRand(item.price * item.quantity)}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>{formatRand(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Shipping</span>
                <span>{shipping === 0 ? "Free" : formatRand(shipping)}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-semibold text-gray-900">
                <span>Total</span>
                <span>{formatRand(total)}</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-black px-6 py-3.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            disabled={items.length === 0}
          >
            Place order
          </button>

          <p className="mt-4 text-xs leading-6 text-gray-500">
            By placing your order you agree to our{" "}
            <Link href="/policies/terms-of-service" className="underline">Terms of service</Link> and{" "}
            <Link href="/policies/refund-policy" className="underline">Refund policy</Link>.
          </p>
        </aside>
      </form>
    </main>
  );
}
