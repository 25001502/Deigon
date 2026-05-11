import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-4xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Missing route</p>
      <h1 className="mt-5 font-display text-6xl leading-none text-ink sm:text-7xl">
        That product path is not part of the demo.
      </h1>
      <p className="mt-6 max-w-2xl text-base leading-8 text-ink/72">
        The prototype only includes the routes needed to pitch the storefront direction. Jump back to the homepage or browse one of the live demo collections.
      </p>
      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full bg-ink px-7 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-sand transition hover:bg-forest"
        >
          Return home
        </Link>
        <Link
          href="/collections/foxygeon-collections"
          className="inline-flex items-center justify-center rounded-full border border-ink/12 px-7 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:border-clay hover:text-clay"
        >
          Browse collection
        </Link>
      </div>
    </main>
  );
}