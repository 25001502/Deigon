"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import { useCart } from "@/components/cart/cart-provider";
import { formatRand } from "@/lib/money";
import { storeInfo } from "@/lib/data/catalog";

const inputClassName =
  "mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-black focus:ring-1 focus:ring-black";

const FREE_DELIVERY_THRESHOLD = 600;
const FLAT_DELIVERY_FEE = 80;
const CHECKOUT_IDEMPOTENCY_KEY =
  "deigon_checkout_idempotency_key";

type CheckoutOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfilmentType: string;
  subtotal: string;
  shippingFee: string;
  total: string;
};

type CheckoutResponse = {
  ok?: boolean;
  order?: CheckoutOrder;
  payment?: { provider: "YOCO"; redirectUrl: string };
  message?: string;
};

function subscribeToCheckoutStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function hasStoredCheckout() {
  try {
    return Boolean(window.sessionStorage.getItem(CHECKOUT_IDEMPOTENCY_KEY));
  } catch {
    return false;
  }
}

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function getCheckoutIdempotencyKey() {
  const existingKey = window.sessionStorage.getItem(
    CHECKOUT_IDEMPOTENCY_KEY,
  );

  if (existingKey) {
    return existingKey;
  }

  const idempotencyKey = crypto.randomUUID();

  window.sessionStorage.setItem(
    CHECKOUT_IDEMPOTENCY_KEY,
    idempotencyKey,
  );

  return idempotencyKey;
}

export function CheckoutPreview() {
  const {
    items,
    subtotal,
    clearCartLocally,
    waitForPendingMutations,
  } = useCart();

  const [fulfilment, setFulfilment] = useState<
    "delivery" | "pickup"
  >("delivery");

  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasPendingCheckout = useSyncExternalStore(
    subscribeToCheckoutStorage,
    hasStoredCheckout,
    () => false,
  );

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [submitError, setSubmitError] =
    useState<string | null>(null);

  const shipping = useMemo(() => {
    if (fulfilment === "pickup") {
      return 0;
    }

    return subtotal >= FREE_DELIVERY_THRESHOLD
      ? 0
      : FLAT_DELIVERY_FEE;
  }, [fulfilment, subtotal]);

  const total = subtotal + shipping;

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      /**
       * CHECKOUT SYNCHRONIZATION BOUNDARY
       *
       * Normal cart interactions are optimistic and
       * backgrounded, but checkout must wait until all
       * pending authenticated mutations have completed.
       */
      await waitForPendingMutations();

      /**
       * The pending operations may have failed and the
       * cart may have been reconciled. A saved checkout
       * key can still resume an already committed order.
       */
      if (items.length === 0 && !hasStoredCheckout()) {
        setSubmitError(
          "Your cart is empty. Please add an item before checking out.",
        );
        return;
      }

      const customerPhone = formValue(
        formData,
        "phone",
      );

      const idempotencyKey = getCheckoutIdempotencyKey();
      const requestBody = {
        idempotencyKey,
        fulfilmentType:
          fulfilment === "delivery"
            ? ("DELIVERY" as const)
            : ("PICKUP" as const),
        customerName: [
          formValue(formData, "firstName"),
          formValue(formData, "lastName"),
        ]
          .filter(Boolean)
          .join(" "),
        customerEmail: formValue(
          formData,
          "email",
        ),
        ...(customerPhone
          ? { customerPhone }
          : {}),
        ...(fulfilment === "delivery"
          ? {
              shippingAddressLine1:
                formValue(
                  formData,
                  "address",
                ),
              shippingCity: formValue(
                formData,
                "city",
              ),
              shippingProvince:
                formValue(
                  formData,
                  "province",
                ),
              shippingPostalCode:
                formValue(
                  formData,
                  "postalCode",
                ),
              shippingCountry:
                "South Africa",
            }
          : {
              pickupLocation:
                storeInfo.pickupLocation,
            }),
      };

      const response = await fetch(
        "/api/checkout",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );

      const responseBody = (await response
        .json()
        .catch(() => null)) as CheckoutResponse | null;

      if (
        !response.ok ||
        !responseBody?.ok ||
        !responseBody.order
      ) {
        throw new Error(
          responseBody?.message ??
            "We couldn't place your order. Please try again.",
        );
      }

      const redirectUrl = responseBody.payment?.redirectUrl;
      let validRedirect = false;
      if (responseBody.payment?.provider === "YOCO" && typeof redirectUrl === "string") {
        try {
          const url = new URL(redirectUrl);
          validRedirect = url.protocol === "https:" && !url.username && !url.password;
        } catch {
          validRedirect = false;
        }
      }
      if (!validRedirect || !redirectUrl) {
        throw new Error("We couldn't start the payment session. Please try again.");
      }

      clearCartLocally();
      window.sessionStorage.removeItem(
        CHECKOUT_IDEMPOTENCY_KEY,
      );
      try {
        window.location.assign(redirectUrl);
      } catch {
        window.sessionStorage.setItem(CHECKOUT_IDEMPOTENCY_KEY, idempotencyKey);
        throw new Error("We couldn't open the payment page. Please try again.");
      }
      setIsRedirecting(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "We couldn't place your order. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isRedirecting) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
        <h1 className="mt-6 text-3xl font-bold text-gray-900">
          Opening secure payment...
        </h1>
        <p className="mt-6 max-w-md text-sm leading-7 text-gray-600">
          Taking you to Yoco to complete your payment.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">
        Checkout
      </h1>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <section className="space-y-8 rounded-lg border border-gray-200 p-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Contact
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                First name
                <input
                  required
                  className={inputClassName}
                  name="firstName"
                  placeholder="First name"
                />
              </label>

              <label className="text-sm font-medium text-gray-700">
                Last name
                <input
                  required
                  className={inputClassName}
                  name="lastName"
                  placeholder="Last name"
                />
              </label>
            </div>

            <label className="mt-4 block text-sm font-medium text-gray-700">
              Email
              <input
                required
                className={inputClassName}
                name="email"
                placeholder="you@example.com"
                type="email"
              />
            </label>

            <label className="mt-4 block text-sm font-medium text-gray-700">
              Phone (optional)
              <input
                className={inputClassName}
                name="phone"
                placeholder="082 000 0000"
                type="tel"
              />
            </label>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Fulfilment
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  setFulfilment("delivery")
                }
                className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                  fulfilment === "delivery"
                    ? "border-black bg-black text-white"
                    : "border-gray-300 text-gray-700 hover:border-black"
                }`}
              >
                Delivery
                <span className="mt-1 block text-xs font-normal opacity-80">
                  R80 flat fee, free over R600
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setFulfilment("pickup")
                }
                className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition ${
                  fulfilment === "pickup"
                    ? "border-black bg-black text-white"
                    : "border-gray-300 text-gray-700 hover:border-black"
                }`}
              >
                Pickup
                <span className="mt-1 block text-xs font-normal opacity-80">
                  {storeInfo.pickupLocation},
                  ready in 24 hours
                </span>
              </button>
            </div>

            {fulfilment === "delivery" ? (
              <div className="mt-4 space-y-4">
                <label className="block text-sm font-medium text-gray-700">
                  Address
                  <input
                    required
                    className={inputClassName}
                    name="address"
                    placeholder="Street address"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700">
                    City
                    <input
                      required
                      className={inputClassName}
                      name="city"
                      placeholder="City"
                    />
                  </label>

                  <label className="text-sm font-medium text-gray-700">
                    Province
                    <input
                      required
                      className={inputClassName}
                      name="province"
                      placeholder="Province"
                    />
                  </label>
                </div>

                <label className="block text-sm font-medium text-gray-700">
                  Postal code
                  <input
                    required
                    className={inputClassName}
                    name="postalCode"
                    placeholder="Postal code"
                    autoComplete="postal-code"
                  />
                </label>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-600">
                  Orders are processed and shipped within 5–10 business days.
                  Delivery is R80, or free on orders of R600 or more.
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Payment
            </h2>

            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-5">
              <h3 className="text-base font-semibold text-gray-900">
                Yoco
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-600">
                After you place your order, you&apos;ll be taken to Yoco
                to complete your payment securely.
              </p>
            </div>
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-gray-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Order summary
          </h2>

          {items.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-6">
              <p className="text-base font-semibold text-gray-900">
                {hasPendingCheckout ? "Resume your checkout" : "Your cart is empty."}
              </p>

              <p className="mt-2 text-sm leading-6 text-gray-600">
                {hasPendingCheckout
                  ? "Enter your checkout details again to retry the pending payment session."
                  : "Add a product before checking out."}
              </p>

              <Link
                href="/collections/foxygeon-collections"
                className="mt-4 inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
              >
                Browse products
              </Link>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {items.map((item) => {
                const options = [
                  item.color,
                  item.size,
                ]
                  .filter(Boolean)
                  .join(" / ");

                return (
                  <div
                    key={
                      item.variantId ??
                      item.handle
                    }
                    className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.title}
                      </p>

                      {options ? (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {options}
                        </p>
                      ) : null}

                      <p className="mt-0.5 text-xs text-gray-500">
                        Qty {item.quantity}
                      </p>
                    </div>

                    <span className="text-sm font-medium text-gray-900">
                      {formatRand(
                        item.price *
                          item.quantity,
                      )}
                    </span>
                  </div>
                );
              })}

              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span>
                  {formatRand(subtotal)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Shipping</span>
                <span>
                  {shipping === 0
                    ? "Free"
                    : formatRand(shipping)}
                </span>
              </div>

              <div className="flex items-center justify-between text-lg font-semibold text-gray-900">
                <span>Total</span>
                <span>
                  {formatRand(total)}
                </span>
              </div>
            </div>
          )}

          {submitError ? (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-700"
            >
              {submitError}
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-black px-6 py-3.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            disabled={
              (items.length === 0 && !hasPendingCheckout) ||
              isSubmitting
            }
          >
            {isSubmitting
              ? "Placing order..."
              : "Place order"}
          </button>

          <p className="mt-4 text-xs leading-6 text-gray-500">
            By placing your order you agree to our{" "}
            <Link
              href="/policies/terms-of-service"
              className="underline"
            >
              Terms of service
            </Link>{" "}
            and{" "}
            <Link
              href="/policies/refund-policy"
              className="underline"
            >
              Refund policy
            </Link>
            .
          </p>
        </aside>
      </form>
    </main>
  );
}
