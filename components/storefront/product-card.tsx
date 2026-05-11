import Link from "next/link";

import type { Product } from "@/lib/data/catalog";
import { formatRand } from "@/lib/money";

import { MockProductMedia } from "./mock-product-media";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="group overflow-hidden rounded-[1.8rem] border border-ink/10 bg-paper shadow-[0_18px_60px_rgba(15,26,22,0.06)] transition hover:-translate-y-1 hover:shadow-[0_24px_80px_rgba(15,26,22,0.1)]">
      <Link href={`/products/${product.handle}`} className="block p-4">
        <MockProductMedia
          title={product.title}
          vendor={product.vendor}
          badge={product.badge}
          themeClass={product.themeClass}
          className="min-h-70"
        />
      </Link>

      <div className="space-y-4 px-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-clay">{product.vendor}</p>
            <Link href={`/products/${product.handle}`} className="mt-2 block text-2xl font-semibold text-ink">
              {product.title}
            </Link>
          </div>
          <span className="text-sm font-semibold text-ink">{formatRand(product.price)}</span>
        </div>

        <p className="text-sm leading-7 text-ink/68">{product.shortDescription}</p>
      </div>
    </article>
  );
}