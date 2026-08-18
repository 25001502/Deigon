import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { collections, products } from "../lib/data/catalog";

// tsx runs this file directly (not via the Prisma CLI), so .env.local must be loaded explicitly.
config({ path: ".env.local" });

// Standalone client for the one-off seed run (not the app's request-scoped singleton in lib/prisma.ts).
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
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

    const sku = variantSkuForHandle(item.handle);
    const variant = await prisma.productVariant.upsert({
      where: { sku },
      update: { price: item.price, productId: product.id },
      create: { sku, price: item.price, productId: product.id },
    });
    variantCount += 1;

    const existingInventory = await prisma.inventory.findUnique({ where: { variantId: variant.id } });
    if (!existingInventory) {
      // Only set on first creation so manually adjusted stock is never reset by rerunning the seed.
      await prisma.inventory.create({ data: { variantId: variant.id, quantity: DEV_DEFAULT_STOCK } });
      inventoryCreatedCount += 1;
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
