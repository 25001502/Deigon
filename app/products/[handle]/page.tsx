import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToCartButton } from "@/components/storefront/add-to-cart-button";
import { MockProductMedia } from "@/components/storefront/mock-product-media";
import { ProductCard } from "@/components/storefront/product-card";
import {
  getCollectionByHandle,
  getProductByHandle,
  getProductsByCollection,
} from "@/lib/data/catalog";
import { formatRand } from "@/lib/money";

type ProductPageProps = {
  params: Promise<{
    handle: string;
  }>;
};

const deliveryDetails = [
  "Free delivery activates over R600",
  "Pickup currently framed for Univen main gate",
  "Yoco handoff will replace this demo button in production",
];

export default async function ProductPage({ params }: ProductPageProps) {
  const { handle } = await params;
  const product = getProductByHandle(handle);

  if (!product) {
    notFound();
  }

  const collection = getCollectionByHandle(product.collectionHandle);
  const relatedProducts = getProductsByCollection(product.collectionHandle)
    .filter((item) => item.handle !== product.handle)
    .slice(0, 3);

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-ink/48">
        <Link href="/" className="transition hover:text-ink">
          Home
        </Link>
        <span>/</span>
        {collection ? (
          <Link href={`/collections/${collection.handle}`} className="transition hover:text-ink">
            {collection.title}
          </Link>
        ) : null}
      </div>

      <section className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div className="rounded-[2.2rem] border border-ink/10 bg-paper p-5 shadow-[0_24px_90px_rgba(15,26,22,0.08)] lg:sticky lg:top-28">
          <MockProductMedia
            title={product.title}
            vendor={product.vendor}
            badge={product.badge}
            themeClass={product.themeClass}
            className="min-h-[540px]"
          />
        </div>

        <div className="space-y-8 rounded-[2.2rem] border border-ink/10 bg-paper px-6 py-8 shadow-[0_24px_90px_rgba(15,26,22,0.08)] sm:px-8 lg:px-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">{product.vendor}</p>
            <h1 className="mt-4 font-display text-6xl leading-[0.94] text-ink sm:text-7xl">
              {product.title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <p className="text-3xl font-semibold text-ink">{formatRand(product.price)}</p>
              <span className="rounded-full border border-clay/20 bg-clay/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-clay">
                {product.badge}
              </span>
            </div>
          </div>

          <div className="space-y-4 text-base leading-8 text-ink/74">
            <p>{product.shortDescription}</p>
            <p>{product.description}</p>
          </div>

          <div className="grid gap-3 rounded-[1.75rem] border border-ink/10 bg-sand/80 p-5 text-sm leading-7 text-ink/74">
            {deliveryDetails.map((detail) => (
              <p key={detail}>{detail}</p>
            ))}
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <AddToCartButton product={product} />
            <Link
              href="/checkout"
              className="inline-flex items-center justify-center rounded-full border border-ink/12 px-7 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-ink transition hover:border-clay hover:text-clay"
            >
              Checkout preview
            </Link>
          </div>
        </div>
      </section>

      {relatedProducts.length > 0 ? (
        <section className="mt-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">Related picks</p>
              <h2 className="mt-3 font-display text-5xl text-ink">Keep the story moving.</h2>
            </div>
            {collection ? (
              <Link
                href={`/collections/${collection.handle}`}
                className="hidden text-sm font-semibold uppercase tracking-[0.22em] text-ink/60 transition hover:text-ink sm:inline"
              >
                Back to collection
              </Link>
            ) : null}
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={relatedProduct.handle} product={relatedProduct} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}