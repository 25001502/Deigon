import "server-only";

import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

import {
  archiveInput,
  createProductInput,
  productId,
  updateProductInput,
  variantCombinationKey,
  variantMutationInput,
} from "./input";
import { productDetailSelect, serializeProductDetail } from "./serialize";
import type { ProductVariantInput } from "./types";

const transactionOptions = {
  maxWait: 5000,
  timeout: 10000,
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
};

function changed(): never {
  throw new ApiError("Product changed before this update. Reload and try again", 409);
}

async function categoryId(tx: Prisma.TransactionClient, slug: string) {
  const category = await tx.category.findUnique({ where: { slug }, select: { id: true } });
  if (!category) throw new ApiError("Category not found", 404);
  return category.id;
}

async function assertSlugAvailable(tx: Prisma.TransactionClient, slug: string, exceptId?: string) {
  const owner = await tx.product.findUnique({ where: { slug }, select: { id: true } });
  if (owner && owner.id !== exceptId) throw new ApiError("Product slug is already in use", 409);
}

async function assertSkuAvailable(tx: Prisma.TransactionClient, sku: string, exceptId?: string) {
  const owner = await tx.productVariant.findFirst({
    where: { sku: { equals: sku, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (owner) throw new ApiError("Variant SKU is already in use", 409);
}

function assertCombinationAvailable(
  variants: Array<{ id: string; size: string | null; color: string | null }>,
  candidate: ProductVariantInput,
  exceptId?: string,
) {
  const key = variantCombinationKey(candidate);
  if (variants.some((variant) => variant.id !== exceptId && variantCombinationKey(variant) === key)) {
    throw new ApiError("Variant size and color combination is already in use", 409);
  }
}

async function productDetail(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.product.findUnique({ where: { id }, select: productDetailSelect });
  if (!row) throw new ApiError("Product not found", 404);
  return serializeProductDetail(row);
}

export async function createAdminProduct(value: unknown) {
  await requireAdmin();
  const input = createProductInput(value);
  return prisma.$transaction(async (tx) => {
    const category = await categoryId(tx, input.categorySlug);
    await assertSlugAvailable(tx, input.slug);
    for (const variant of input.variants) await assertSkuAvailable(tx, variant.sku);
    const product = await tx.product.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        badge: input.badge,
        details: input.details,
        categoryId: category,
        featured: input.featured,
        isActive: input.isActive,
      },
      select: { id: true },
    });
    if (input.images.length) {
      await tx.productImage.createMany({
        data: input.images.map((image, position) => ({ ...image, position, productId: product.id })),
      });
    }
    for (const variant of input.variants) {
      const created = await tx.productVariant.create({ data: { ...variant, productId: product.id }, select: { id: true } });
      // Checkout treats a missing inventory row as unavailable; new catalogue variants start with no stock.
      await tx.inventory.create({ data: { variantId: created.id, quantity: 0 } });
    }
    return productDetail(tx, product.id);
  }, transactionOptions);
}

export async function updateAdminProduct(id: string, value: unknown) {
  await requireAdmin();
  const validId = productId(id);
  const input = updateProductInput(value);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({ where: { id: validId }, select: { id: true, updatedAt: true } });
    if (!existing) throw new ApiError("Product not found", 404);
    if (existing.updatedAt.toISOString() !== input.expectedUpdatedAt) changed();
    const category = await categoryId(tx, input.categorySlug);
    await assertSlugAvailable(tx, input.slug, validId);
    const now = new Date();
    const result = await tx.product.updateMany({
      where: { id: validId, updatedAt: existing.updatedAt },
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        badge: input.badge,
        details: input.details,
        categoryId: category,
        featured: input.featured,
        isActive: input.isActive,
        updatedAt: now,
      },
    });
    if (result.count !== 1) changed();
    await tx.productImage.deleteMany({ where: { productId: validId } });
    if (input.images.length) {
      await tx.productImage.createMany({
        data: input.images.map((image, position) => ({ ...image, position, productId: validId })),
      });
    }
    return productDetail(tx, validId);
  }, transactionOptions);
}

export async function createAdminProductVariant(id: string, value: unknown) {
  await requireAdmin();
  const validId = productId(id);
  const input = variantMutationInput(value);
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: validId },
      select: { updatedAt: true, variants: { select: { id: true, size: true, color: true } } },
    });
    if (!product) throw new ApiError("Product not found", 404);
    if (product.updatedAt.toISOString() !== input.expectedUpdatedAt) changed();
    await assertSkuAvailable(tx, input.sku);
    assertCombinationAvailable(product.variants, input);
    const now = new Date();
    const result = await tx.product.updateMany({
      where: { id: validId, updatedAt: product.updatedAt }, data: { updatedAt: now },
    });
    if (result.count !== 1) changed();
    const variant = await tx.productVariant.create({
      data: { sku: input.sku, size: input.size, color: input.color, price: input.price, productId: validId },
      select: { id: true },
    });
    await tx.inventory.create({ data: { variantId: variant.id, quantity: 0 } });
    return productDetail(tx, validId);
  }, transactionOptions);
}

export async function updateAdminProductVariant(productValue: string, variantValue: string, value: unknown) {
  await requireAdmin();
  const validProductId = productId(productValue);
  const validVariantId = productId(variantValue);
  const input = variantMutationInput(value);
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: validProductId },
      select: { updatedAt: true, variants: { select: { id: true, size: true, color: true } } },
    });
    if (!product) throw new ApiError("Product not found", 404);
    if (!product.variants.some((variant) => variant.id === validVariantId)) throw new ApiError("Variant not found", 404);
    if (product.updatedAt.toISOString() !== input.expectedUpdatedAt) changed();
    await assertSkuAvailable(tx, input.sku, validVariantId);
    assertCombinationAvailable(product.variants, input, validVariantId);
    const now = new Date();
    const result = await tx.product.updateMany({
      where: { id: validProductId, updatedAt: product.updatedAt }, data: { updatedAt: now },
    });
    if (result.count !== 1) changed();
    await tx.productVariant.update({
      where: { id: validVariantId },
      data: { sku: input.sku, size: input.size, color: input.color, price: input.price },
    });
    return productDetail(tx, validProductId);
  }, transactionOptions);
}

export async function archiveAdminProduct(id: string, value: unknown) {
  await requireAdmin();
  const validId = productId(id);
  const input = archiveInput(value);
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: validId }, select: { updatedAt: true, isActive: true } });
    if (!product) throw new ApiError("Product not found", 404);
    if (product.updatedAt.toISOString() !== input.expectedUpdatedAt) changed();
    if (product.isActive) {
      const result = await tx.product.updateMany({
        where: { id: validId, updatedAt: product.updatedAt }, data: { isActive: false, updatedAt: new Date() },
      });
      if (result.count !== 1) changed();
    }
    return productDetail(tx, validId);
  }, transactionOptions);
}

export async function rejectAdminProductVariantRemoval(productValue: string, variantValue: string, value: unknown) {
  await requireAdmin();
  productId(productValue);
  productId(variantValue);
  archiveInput(value);
  throw new ApiError("Variants cannot be removed safely because they have no archive state", 409);
}
