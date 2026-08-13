import Link from "next/link";

import type { Collection } from "@/lib/data/catalog";

export function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link
      href={`/collections/${collection.handle}`}
      className="group relative flex min-h-64 flex-col justify-end overflow-hidden rounded-lg border border-gray-200 p-6 shadow-sm transition hover:shadow-md"
    >
      <div className={`absolute inset-0 opacity-90 transition duration-300 group-hover:scale-105 ${collection.themeClass}`} />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{collection.tagline}</p>
        <h3 className="mt-2 text-2xl font-bold text-white">{collection.title}</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-white/85">{collection.description}</p>
      </div>
    </Link>
  );
}
