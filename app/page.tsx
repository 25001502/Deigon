import Link from "next/link";

import { CollectionCard } from "@/components/storefront/collection-card";
import { MockProductMedia } from "@/components/storefront/mock-product-media";
import { ProductCard } from "@/components/storefront/product-card";
import {
  announcements,
  collections,
  getFeaturedProducts,
  siteContent,
} from "@/lib/data/catalog";

const featuredProducts = getFeaturedProducts();

export default function Home() {
  return (
    <main className="pb-24">
      <section className="border-b border-ink/10 bg-ink text-sand">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 text-xs font-medium uppercase tracking-[0.28em] sm:px-6 lg:px-8">
          <span>{announcements[0]}</span>
          <span className="hidden text-sand/70 sm:inline">{announcements[1]}</span>
        </div>
      </section>

      <section className="relative overflow-hidden">
        <div className="home-hero-overlay pointer-events-none absolute inset-0" />
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-24">
          <div className="relative z-10">
            <span className="inline-flex items-center rounded-full border border-clay/20 bg-clay/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-clay">
              {siteContent.hero.eyebrow}
            </span>
            <h1 className="mt-6 max-w-3xl font-display text-6xl leading-[0.92] text-ink sm:text-7xl lg:text-8xl">
              {siteContent.hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-ink/72 sm:text-xl">
              {siteContent.hero.description}
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/collections/foxygeon-collections"
                className="inline-flex items-center justify-center rounded-full bg-ink px-7 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-sand transition hover:bg-forest"
              >
                Shop the edit
              </Link>
              <Link
                href="/products/after-hours"
                className="inline-flex items-center justify-center rounded-full border border-ink/15 px-7 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:border-clay hover:text-clay"
              >
                Open signature scent
              </Link>
            </div>

            <dl className="mt-12 grid gap-6 border-t border-ink/10 pt-8 text-sm text-ink/72 sm:grid-cols-3">
              {siteContent.stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-xs font-semibold uppercase tracking-[0.25em] text-ink/45">
                    {stat.label}
                  </dt>
                  <dd className="mt-3 text-2xl font-semibold text-ink">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative z-10 grid gap-5 lg:pt-10">
            <div className="rounded-4xl border border-ink/10 bg-paper p-5 shadow-[0_20px_80px_rgba(15,26,22,0.08)]">
              <MockProductMedia
                title="After Hours"
                vendor="Patron Fragrance"
                badge="Signature drop"
                themeClass={featuredProducts[0].themeClass}
                className="min-h-90"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {collections.slice(0, 2).map((collection) => (
                <div
                  key={collection.handle}
                  className="rounded-[1.75rem] border border-ink/10 bg-paper px-5 py-6 shadow-[0_18px_60px_rgba(15,26,22,0.06)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">
                    {collection.tagline}
                  </p>
                  <h2 className="mt-3 font-display text-4xl leading-none text-ink">
                    {collection.title}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-ink/70">{collection.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">
              Curated collections
            </p>
            <h2 className="mt-3 font-display text-5xl text-ink">Build the mood before the cart.</h2>
          </div>
          <Link
            href="/collections/foxygeon-collections"
            className="hidden text-sm font-semibold uppercase tracking-[0.22em] text-ink/60 transition hover:text-ink sm:inline"
          >
            Browse all
          </Link>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {collections.map((collection) => (
            <CollectionCard key={collection.handle} collection={collection} />
          ))}
        </div>
      </section>

      <section className="border-y border-ink/10 bg-paper/70">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">
                Featured now
              </p>
              <h2 className="mt-3 font-display text-5xl text-ink">
                {siteContent.featuredHeading}
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-ink/70">{siteContent.featuredCopy}</p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.handle} product={product} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">
            Brand premise
          </p>
          <h2 className="mt-3 font-display text-5xl text-ink">Where style meets intention.</h2>
        </div>
        <div className="grid gap-8 text-base leading-8 text-ink/72 sm:grid-cols-2">
          <p>{siteContent.story}</p>
          <div className="rounded-[1.75rem] border border-ink/10 bg-ink px-6 py-7 text-sand shadow-[0_20px_60px_rgba(15,26,22,0.14)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sand/60">
              Production handoff
            </p>
            <p className="mt-4 text-lg leading-8">
              This prototype keeps the journey believable now, then swaps in real Yoco, inventory,
              and order logic once the owner signs off.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
