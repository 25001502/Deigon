import Link from "next/link";

import type { Collection } from "@/lib/data/catalog";

export function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link
      href={`/collections/${collection.handle}`}
      className="group relative overflow-hidden rounded-4xl border border-ink/10 bg-paper p-6 shadow-[0_18px_60px_rgba(15,26,22,0.06)] transition hover:-translate-y-1 hover:shadow-[0_24px_80px_rgba(15,26,22,0.1)]"
    >
      <div className={`absolute inset-x-5 top-5 h-40 rounded-3xl opacity-90 transition group-hover:scale-[1.02] ${collection.themeClass}`} />
      <div className="relative pt-44">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-clay">{collection.tagline}</p>
        <h3 className="mt-3 font-display text-4xl leading-none text-ink">{collection.title}</h3>
        <p className="mt-4 text-sm leading-7 text-ink/70">{collection.description}</p>
      </div>
    </Link>
  );
}