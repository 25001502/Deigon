import Link from "next/link";

import { getFeaturedProducts, getFoxygetonCollectionProducts } from "@/lib/data/catalog";
import { ProductCard } from "@/components/storefront/product-card";

const featuredProducts = getFeaturedProducts();
const foxygeonProducts = getFoxygetonCollectionProducts();

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="relative w-full min-h-hero overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-neutral-800 via-neutral-700 to-neutral-500" />

        {/* Overlay card — bottom left, matching live store */}
        <div className="absolute bottom-8 left-6 z-10 max-w-70 rounded-xl bg-white/95 p-6 shadow-lg backdrop-blur-sm sm:left-12 sm:max-w-xs">
          <h2 className="text-xl font-bold text-gray-900 leading-snug">
            Shop Our Latest Collection
          </h2>
          <Link
            href="/collections/foxygeon-collections"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-gray-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            Shop now
          </Link>
        </div>
      </section>

      {/* Featured products */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900">Featured products</h2>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4 border-t border-gray-200 pt-10">
          {featuredProducts.map((product) => (
            <ProductCard key={product.handle} product={product} />
          ))}
        </div>
      </section>

      {/* FOXYGEON COLLECTIONS */}
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">FOXYGEON COLLECTIONS</h2>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4">
          {foxygeonProducts.map((product) => (
            <ProductCard key={product.handle} product={product} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/collections/foxygeon-collections"
            aria-label="View all products in the FOXYGEON COLLECTIONS collection"
            className="rounded-full border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-900 transition hover:border-gray-900"
          >
            View all
          </Link>
        </div>
      </section>

      {/* WHERE STYLE MEETS INNOVATION */}
      <section className="border-t border-gray-200 bg-white py-14">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            WHERE STYLE MEETS INNOVATION
          </h2>
          <p className="mt-6 text-base leading-8 text-gray-600">
            We bringing you carefully selected fashion that blends modern style with forward
            thinking design. Every collection featured on Deigon reflects creativity, quality &amp;
            individuality. Whether you&apos;re here to discover something new or redefine your
            everyday look, you&apos;re at the right place.
          </p>
        </div>
      </section>
    </main>
  );
}

