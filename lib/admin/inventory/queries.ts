import "server-only";

import type { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/errors";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

import {
  adjustmentHistoryInput,
  encodeAdjustmentCursor,
  encodeInventoryCursor,
  inventoryListInput,
  variantId,
} from "./input";
import {
  adjustmentSelect,
  inventoryDetailSelect,
  inventoryListSelect,
  serializeAdjustment,
  serializeInventoryDetail,
  serializeInventoryListItem,
} from "./serialize";

export async function listAdminInventory(params: URLSearchParams) {
  await requireAdmin();
  const input = inventoryListInput(params);
  const search = input.search.replace(/[\\%_]/g, "\\$&");
  const filters: Prisma.ProductVariantWhereInput = {
    ...(input.status || input.category ? {
      product: {
        ...(input.status ? { isActive: input.status === "ACTIVE" } : {}),
        ...(input.category ? { category: { slug: input.category } } : {}),
      },
    } : {}),
    ...(input.stock === "MISSING_INVENTORY" ? { inventory: { is: null } } : {}),
    ...(input.stock === "OUT_OF_STOCK" ? { inventory: { is: { quantity: 0 } } } : {}),
    ...(input.stock === "IN_STOCK" ? { inventory: { is: { quantity: { gt: 0 } } } } : {}),
    ...(input.search ? {
      OR: [
        { sku: { contains: search, mode: "insensitive" } },
        { size: { contains: search, mode: "insensitive" } },
        { color: { contains: search, mode: "insensitive" } },
        { product: { name: { contains: search, mode: "insensitive" } } },
        { product: { slug: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };
  const boundary: Prisma.ProductVariantWhereInput = input.cursor ? {
    OR: [
      { updatedAt: { lt: new Date(input.cursor.updatedAt) } },
      { updatedAt: new Date(input.cursor.updatedAt), id: { lt: input.cursor.id } },
    ],
  } : {};
  const rows = await prisma.productVariant.findMany({
    where: { AND: [filters, boundary] },
    select: inventoryListSelect,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  return {
    inventory: page.map(serializeInventoryListItem),
    nextCursor: rows.length > input.limit && page.length
      ? encodeInventoryCursor(input, page[page.length - 1])
      : null,
  };
}

export async function getAdminInventory(value: string) {
  await requireAdmin();
  const row = await prisma.productVariant.findUnique({ where: { id: variantId(value) }, select: inventoryDetailSelect });
  if (!row) throw new ApiError("Product variant not found", 404);
  return serializeInventoryDetail(row);
}

export async function listAdminInventoryAdjustments(value: string, params: URLSearchParams) {
  await requireAdmin();
  const validVariantId = variantId(value);
  const input = adjustmentHistoryInput(params);
  const exists = await prisma.productVariant.findUnique({ where: { id: validVariantId }, select: { id: true } });
  if (!exists) throw new ApiError("Product variant not found", 404);
  const boundary: Prisma.InventoryAdjustmentWhereInput = input.cursor ? {
    OR: [
      { createdAt: { lt: new Date(input.cursor.createdAt) } },
      { createdAt: new Date(input.cursor.createdAt), id: { lt: input.cursor.id } },
    ],
  } : {};
  const rows = await prisma.inventoryAdjustment.findMany({
    where: { AND: [{ variantId: validVariantId }, boundary] },
    select: adjustmentSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  return {
    adjustments: page.map(serializeAdjustment),
    nextCursor: rows.length > input.limit && page.length ? encodeAdjustmentCursor(page[page.length - 1]) : null,
  };
}
