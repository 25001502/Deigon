import Link from "next/link";

export default function PaymentFailurePage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900">Payment not confirmed</h1>
      <p className="mt-6 max-w-md text-sm leading-7 text-gray-600">
        We could not confirm your payment from this return. Your order is still recorded.
        Please check your account for order updates before placing another order.
      </p>
      <Link href="/account#orders" className="mt-8 inline-flex items-center justify-center rounded-full bg-black px-7 py-3.5 text-sm font-medium text-white transition hover:bg-neutral-800">
        View your orders
      </Link>
    </main>
  );
}
