import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { collections, products } from "../lib/data/catalog";

// tsx runs this file directly (not via the Prisma CLI), so .env.local must be loaded explicitly.
config({ path: ".env.local" });

// Standalone client for the one-off seed run (not the app's request-scoped singleton in lib/prisma.ts).
// Local/dev databases (e.g. a local Postgres used to dry-run this seed) don't speak TLS; only force
// SSL for non-local hosts such as Supabase.
const databaseUrl = process.env.DATABASE_URL ?? "";
const isLocalDatabase = /(localhost|127\.0\.0\.1)/.test(databaseUrl);
const adapter = new PrismaPg({
  connectionString: databaseUrl,
  ssl: isLocalDatabase ? undefined : { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter });

// Catalogue has no real stock numbers yet; this is a documented development-only placeholder.
const DEV_DEFAULT_STOCK = 25;

function variantSkuForHandle(handle: string) {
  return handle.toUpperCase();
}

async function main() {
  const seedCollections = collections.filter((collection) => collection.handle !== "all");
  const categoryIdByHandle = new Map<string, string>();

  for (const collection of seedCollections) {
    const category = await prisma.category.upsert({
      where: { slug: collection.handle },
      update: { name: collection.title },
      create: { slug: collection.handle, name: collection.title },
    });
    categoryIdByHandle.set(collection.handle, category.id);
  }

  let productCount = 0;
  let variantCount = 0;
  let imageCount = 0;
  let inventoryCreatedCount = 0;

  for (const item of products) {
    const categoryId = categoryIdByHandle.get(item.collectionHandle);

    if (!categoryId) {
      console.warn(`Skipping "${item.handle}": unknown collectionHandle "${item.collectionHandle}"`);
      continue;
    }

    const description = [item.shortDescription, item.description].filter(Boolean).join("\n\n");

    const product = await prisma.product.upsert({
      where: { slug: item.handle },
      update: {
        name: item.title,
        description,
        badge: item.badge,
        details: item.details ?? [],
        featured: item.featured ?? false,
        isActive: true,
        categoryId,
      },
      create: {
        slug: item.handle,
        name: item.title,
        description,
        badge: item.badge,
        details: item.details ?? [],
        featured: item.featured ?? false,
        isActive: true,
        categoryId,
      },
    });
    productCount += 1;

    const images = item.images && item.images.length > 0 ? item.images : item.image ? [item.image] : [];

    // Scoped to this product's own images only; safe to fully resync from the catalogue on every run.
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    if (images.length > 0) {
      const created = await prisma.productImage.createMany({
        data: images.map((url, index) => ({
          productId: product.id,
          url,
          alt: item.title,
          position: index,
        })),
      });
      imageCount += created.count;
    }

    // Products with an explicit color/size matrix (e.g. Legacy Links) seed one ProductVariant per
    // combination; everything else falls back to a single generic (color: null, size: null) variant
    // using the product's own price, matching the historical single-SKU behaviour.
    const variantSeeds =
      item.variantSeeds && item.variantSeeds.length > 0
        ? item.variantSeeds
        : [{ sku: variantSkuForHandle(item.handle), color: null, size: null, price: item.price }];

    for (const variantSeed of variantSeeds) {
      const price = variantSeed.price ?? item.price;
      const variant = await prisma.productVariant.upsert({
        where: { sku: variantSeed.sku },
        update: {
          price,
          productId: product.id,
          color: variantSeed.color ?? null,
          size: variantSeed.size ?? null,
        },
        create: {
          sku: variantSeed.sku,
          price,
          productId: product.id,
          color: variantSeed.color ?? null,
          size: variantSeed.size ?? null,
        },
      });
      variantCount += 1;

      // Every ProductVariant must have exactly one Inventory row for the frontend variant selector
      // to treat it as purchasable. Only set the quantity on first creation so manually adjusted or
      // previously seeded stock (e.g. the Legacy Links rows created directly in Supabase) is never
      // reset by rerunning the seed — this keeps the seed idempotent.
      const existingInventory = await prisma.inventory.findUnique({ where: { variantId: variant.id } });
      if (!existingInventory) {
        const quantity = variantSeed.quantity ?? DEV_DEFAULT_STOCK;
        await prisma.inventory.create({ data: { variantId: variant.id, quantity } });
        inventoryCreatedCount += 1;
      }
    }
  }

  console.log(
    `Seed complete: ${categoryIdByHandle.size} categories, ${productCount} products, ${variantCount} variants, ${imageCount} images upserted, ${inventoryCreatedCount} new inventory rows.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
