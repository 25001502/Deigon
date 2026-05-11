import Link from "next/link";

import { getFeaturedProducts, getFoxygetonCollectionProducts } from "@/lib/data/catalog";
import { formatRand } from "@/lib/money";
import type { Product } from "@/lib/data/catalog";

const featuredProducts = getFeaturedProducts();
const foxygeonProducts = getFoxygetonCollectionProducts();

function ShopProductCard({ product }: { product: Product }) {
  return (
    <div className="group">
      <Link href={`/products/${product.handle}`} className="block overflow-hidden rounded-lg bg-gray-100">
        <div
          className={`aspect-3/4 w-full ${product.themeClass} transition-transform duration-300 group-hover:scale-105`}
        />
      </Link>
      <div className="mt-3">
        <h3 className="text-sm font-semibold text-gray-900">
          <Link href={`/products/${product.handle}`} className="hover:underline">
            {product.title}
          </Link>
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          <span className="font-medium">Vendor:</span> {product.vendor}
        </p>
        <p className="mt-1 text-sm text-gray-900">
          <span className="text-xs font-normal text-gray-500">Regular price </span>
          {formatRand(product.price)}
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      {/* Hero slideshow */}
      <section className="relative w-full min-h-hero overflow-hidden">
        {/* Simulated brand photo background */}
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-gray-500 via-gray-400 to-gray-300">
          <span className="select-none text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
            Brand Photography
          </span>
        </div>

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
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4">
          {featuredProducts.map((product) => (
            <ShopProductCard key={product.handle} product={product} />
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
            <ShopProductCard key={product.handle} product={product} />
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
