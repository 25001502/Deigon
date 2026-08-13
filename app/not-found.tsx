import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-4xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">404</p>
      <h1 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">
        We couldn&apos;t find that page.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-7 text-gray-600">
        The page you&apos;re looking for may have moved or no longer exists. Head back home or keep browsing.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full bg-black px-7 py-3.5 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Return home
        </Link>
        <Link
          href="/collections/foxygeon-collections"
          className="inline-flex items-center justify-center rounded-full border border-gray-300 px-7 py-3.5 text-sm font-medium text-gray-900 transition hover:border-black"
        >
          Browse collection
        </Link>
      </div>
    </main>
  );
}
