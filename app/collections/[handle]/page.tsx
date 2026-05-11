import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductCard } from "@/components/storefront/product-card";
import { getCollectionByHandle, getProductsByCollection } from "@/lib/data/catalog";

type CollectionPageProps = {
  params: Promise<{
    handle: string;
  }>;
};

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { handle } = await params;
  const collection = getCollectionByHandle(handle);

  if (!collection) {
    notFound();
  }

  const products = getProductsByCollection(handle);

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-ink/10 bg-paper px-6 py-10 shadow-[0_24px_90px_rgba(15,26,22,0.08)] sm:px-8 lg:px-10 lg:py-14">
        <div className={`absolute inset-x-6 top-6 h-52 rounded-4xl opacity-95 ${collection.themeClass}`} />

        <div className="relative z-10 pt-44 lg:flex lg:items-end lg:justify-between lg:gap-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">
              {collection.tagline}
            </p>
            <h1 className="mt-4 font-display text-5xl leading-none text-ink sm:text-6xl">
              {collection.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-ink/72">
              {collection.description}
            </p>
          </div>

          <div className="mt-8 rounded-[1.75rem] border border-ink/10 bg-ink px-6 py-5 text-sand lg:mt-0 lg:max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sand/60">
              Collection view
            </p>
            <p className="mt-3 text-sm leading-7 text-sand/78">
              The layout shifts away from crowded sliders and gives each product a clearer role in the story.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-12 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Catalog slice</p>
          <h2 className="mt-3 text-3xl font-semibold text-ink">{products.length} products in this edit</h2>
        </div>
        <Link
          href="/checkout"
          className="inline-flex items-center justify-center rounded-full border border-ink/12 px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:border-clay hover:text-clay"
        >
          Preview checkout flow
        </Link>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.handle} product={product} />
        ))}
      </section>
    </main>
  );
}