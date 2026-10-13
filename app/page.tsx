import Link from "next/link";

import { ProductCard } from "@/components/storefront/product-card";
import { VideoHero } from "@/components/storefront/video-hero";
import { getProductsFromDb } from "@/lib/products/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  let featuredProducts = [];
  let foxygeonProducts = [];

  try {
    const { products } = await getProductsFromDb({ pageSize: 50 });
    featuredProducts = products.filter((product) => product.featured);
    foxygeonProducts = products
      .filter((product) => !product.featured && product.collectionHandle === "foxygeon-collections")
      .slice(0, 4);
  } catch (error) {
    console.error("Failed to load storefront products:", error);
    return (
      <main>
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Products are temporarily unavailable
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            We could not load the storefront.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <VideoHero />

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
