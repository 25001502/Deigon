import { CollectionCard } from "@/components/storefront/collection-card";
import { collections } from "@/lib/data/catalog";

export const metadata = {
  title: "Collections",
  description: "Browse every Deigon collection — FOXYGEON streetwear, and Patron Fragrance.",
};

export default function CollectionsPage() {
  const shopCollections = collections.filter((collection) => collection.handle !== "all");

  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">Collections</h1>
      <p className="mt-2 text-sm text-gray-600">Shop by collection.</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shopCollections.map((collection) => (
          <CollectionCard key={collection.handle} collection={collection} />
        ))}
      </div>
    </main>
  );
}
