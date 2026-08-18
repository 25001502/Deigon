import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductCard } from "@/components/storefront/product-card";
import { getCollectionByHandle, type Product } from "@/lib/data/catalog";
import { getProducts, ProductApiError } from "@/lib/products";

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

  let products: Product[] = [];
  let loadError = false;

  try {
    ({ products } = await getProducts({ category: handle }));
  } catch (error) {
    if (error instanceof ProductApiError && error.status === 404) {
      notFound();
    }
    loadError = true;
    products = [];
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <nav className="text-xs text-gray-500">
        <Link href="/" className="hover:text-gray-900">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{collection.title}</span>
      </nav>

      <div className="relative mt-6 overflow-hidden rounded-lg">
        <div className={`flex min-h-48 flex-col justify-center px-6 py-10 sm:px-10 border border-black/20 `}>
          <p className="text-xs font-semibold uppercase tracking-wide text-black">{collection.tagline}</p>
          <h1 className="mt-3 text-3xl font-bold text-black sm:text-4xl">{collection.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-black/90">{collection.description}</p>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between border-b border-gray-200 pb-4">
        <p className="text-sm text-gray-600">{loadError ? "Products unavailable" : `${products.length} products`}</p>
      </div>

      <section className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {loadError ? (
          <p className="col-span-full py-12 text-center text-sm text-gray-600">Products could not be loaded. Please try again shortly.</p>
        ) : products.length === 0 ? (
          <p className="col-span-full py-12 text-center text-sm text-gray-600">No products found in this collection.</p>
        ) : (
          products.map((product) => <ProductCard key={product.handle} product={product} />)
        )}
      </section>
    </main>
  );
}
