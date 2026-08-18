import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MockProductMedia } from "@/components/storefront/mock-product-media";
import { ProductPurchasePanel } from "@/components/storefront/product-purchase-panel";
import { ProductCard } from "@/components/storefront/product-card";
import { getCollectionByHandle, storeInfo } from "@/lib/data/catalog";
import { formatRand } from "@/lib/money";
import { getProductBySlug, getProducts, ProductApiError } from "@/lib/products";

type ProductPageProps = {
  params: Promise<{
    handle: string;
  }>;
};

export default async function ProductPage({ params }: ProductPageProps) {
  const { handle } = await params;
  let product;
  try {
    product = await getProductBySlug(handle);
  } catch (error) {
    if (error instanceof ProductApiError && error.status === 404) notFound();
    throw error;
  }

  const collection = getCollectionByHandle(product.collectionHandle);
  const { products: relatedProducts } = await getProducts({ category: product.collectionHandle });
  const related = relatedProducts
    .filter((item) => item.handle !== product.handle)
    .slice(0, 3);
  const gallery = product.images && product.images.length > 0 ? product.images : product.image ? [product.image] : [];

  return (
    <main className="bg-[#f5f5f7] px-4 py-10 sm:px-6 lg:min-h-[calc(100vh-8rem)] lg:px-8 lg:py-14">
      <section className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(21rem,0.9fr)] lg:gap-16">
        <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          {product.image ? (
            <div className="relative aspect-square overflow-hidden rounded-lg">
              <Image
                src={product.image}
                alt={product.title}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          ) : (
            <MockProductMedia
              title={product.title}
              vendor={product.vendor}
              badge={product.badge}
              themeClass={product.themeClass}
              className="aspect-square min-h-0 rounded-lg p-7 sm:p-9"
            />
          )}

          {gallery.length > 1 ? (
            <div className="mt-4 grid grid-cols-4 gap-3">
              {gallery.map((src) => (
                <div key={src} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                  <Image src={src} alt={product.title} fill sizes="120px" className="object-cover" />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="max-w-xl pt-1 lg:pt-2">
          <div>
            {collection ? (
              <Link href={`/collections/${collection.handle}`} className="text-sm text-neutral-600 transition hover:text-black">
                {product.vendor}
              </Link>
            ) : (
              <p className="text-sm text-neutral-600">{product.vendor}</p>
            )}
            <h1 className="mt-6 text-4xl font-bold tracking-normal text-black sm:text-5xl">{product.title}</h1>
            <p className="mt-6 text-xl font-medium text-neutral-900">{formatRand(product.price)}</p>
            <p className="mt-3 text-sm text-neutral-600">
              <Link href="/policies/shipping-policy" className="underline">Shipping</Link> calculated at checkout.
            </p>
          </div>

          <div className="mt-7">
            <ProductPurchasePanel product={product} />
          </div>

          <div className="mt-9 border-t border-neutral-300 pt-6 text-sm leading-7 text-neutral-600">
            <p>{product.shortDescription}</p>
            <p className="mt-3 whitespace-pre-line">{product.description}</p>

            {product.details && product.details.length > 0 ? (
              <ul className="mt-4 space-y-1.5">
                {product.details.map((detail) => (
                  <li key={detail} className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="mt-6 flex items-center gap-2 text-neutral-700">
              <span className="text-base text-emerald-600">&#10003;</span> Pickup available at {storeInfo.pickupLocation}
            </p>
            <p className="ml-6 mt-1 text-xs">Usually ready in 24 hours</p>
            <Link href="/" className="ml-6 mt-3 inline-block underline underline-offset-2 hover:text-black">View store information</Link>
          </div>
        </div>
      </section>

      {related.length > 0 ? (
        <section className="mx-auto mt-16 max-w-6xl">
          <div className="flex items-end justify-between gap-4 border-t border-neutral-300 pt-8">
            <h2 className="text-2xl font-bold text-black">You may also like</h2>
            {collection ? (
              <Link
                href={`/collections/${collection.handle}`}
                className="hidden text-sm font-medium text-neutral-600 transition hover:text-black sm:inline"
              >
                Back to {collection.title}
              </Link>
            ) : null}
          </div>

          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3">
            {related.map((relatedProduct) => (
              <ProductCard key={relatedProduct.handle} product={relatedProduct} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
