import Image from "next/image";
import Link from "next/link";

import type { Product } from "@/lib/data/catalog";
import { formatRand } from "@/lib/money";

import { MockProductMedia } from "./mock-product-media";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="group">
      <Link href={`/products/${product.handle}`} className="relative block overflow-hidden rounded-lg bg-gray-100">
        <div className="relative aspect-3/4 w-full overflow-hidden">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.title}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <MockProductMedia
              title={product.title}
              vendor={product.vendor}
              badge={product.badge}
              themeClass={product.themeClass}
              className="h-full min-h-0 rounded-none border-none p-5"
            />
          )}
        </div>
        {product.badge ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-900 shadow-sm">
            {product.badge}
          </span>
        ) : null}
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
    </article>
  );
}
