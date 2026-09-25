import "server-only";

import type { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

import { encodeProductCursor, productId, productListInput } from "./input";
import {
  productDetailSelect,
  productListSelect,
  serializeProductDetail,
  serializeProductListItem,
} from "./serialize";

export async function listAdminProducts(params: URLSearchParams) {
  await requireAdmin();
  const input = productListInput(params);
  const search = input.search.replace(/[\\%_]/g, "\\$&");
  const filters: Prisma.ProductWhereInput = {
    ...(input.status ? { isActive: input.status === "ACTIVE" } : {}),
    ...(input.featured ? { featured: input.featured === "FEATURED" } : {}),
    ...(input.category ? { category: { slug: input.category } } : {}),
    ...(input.search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { category: { name: { contains: search, mode: "insensitive" } } },
        { variants: { some: { sku: { contains: search, mode: "insensitive" } } } },
      ],
    } : {}),
  };
  const boundary: Prisma.ProductWhereInput = input.cursor ? {
    OR: [
      { updatedAt: { lt: new Date(input.cursor.updatedAt) } },
      { updatedAt: new Date(input.cursor.updatedAt), id: { lt: input.cursor.id } },
    ],
  } : {};
  const rows = await prisma.product.findMany({
    where: { AND: [filters, boundary] },
    select: productListSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  return {
    products: page.map(serializeProductListItem),
    nextCursor: rows.length > input.limit && page.length
      ? encodeProductCursor(input, page[page.length - 1])
      : null,
  };
}

export async function getAdminProduct(id: string) {
  await requireAdmin();
  const row = await prisma.product.findUnique({ where: { id: productId(id) }, select: productDetailSelect });
  if (!row) throw new ApiError("Product not found", 404);
  return serializeProductDetail(row);
}

export async function listAdminProductCategories() {
  await requireAdmin();
  return prisma.category.findMany({
    select: { name: true, slug: true },
    orderBy: [{ name: "asc" }, { slug: "asc" }],
  });
}
