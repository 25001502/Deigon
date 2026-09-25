import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { publicProductInclude, serializeProduct } from "@/lib/api/serialize-product";
import { normalizeProduct, type StorefrontProduct } from "@/lib/products";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

type GetProductsOptions = {
  category?: string;
  search?: string;
  pageSize?: number;
};

export async function getProductsFromDb(
  options: GetProductsOptions = {},
): Promise<{
  products: StorefrontProduct[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}> {
  const page = 1;
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(options.pageSize ?? DEFAULT_PAGE_SIZE)),
  );

  const search = options.search?.trim();
  const categorySlug =
    options.category && options.category !== "all"
      ? options.category
      : undefined;

  const where: Prisma.ProductWhereInput = {
    isActive: true,
  };

  if (search) {
    where.name = {
      contains: search,
      mode: "insensitive",
    };
  }

  if (categorySlug) {
    where.category = {
      slug: categorySlug,
    };
  }

  const total = await prisma.product.count({
    where,
  });

  const products = await prisma.product.findMany({
    where,
    include: publicProductInclude,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    products: products
      .map(serializeProduct)
      .map(normalizeProduct),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function getProductBySlugFromDb(
  slug: string,
): Promise<StorefrontProduct | null> {
  const product = await prisma.product.findFirst({
    where: {
      slug,
      isActive: true,
    },
    include: publicProductInclude,
  });

  if (!product) {
    return null;
  }

  return normalizeProduct(serializeProduct(product));
}
