import "server-only";

import type { Prisma } from "@prisma/client";

export const inventoryListSelect = {
  id: true,
  sku: true,
  size: true,
  color: true,
  updatedAt: true,
  product: {
    select: {
      name: true,
      slug: true,
      isActive: true,
      category: { select: { name: true, slug: true } },
    },
  },
  inventory: { select: { quantity: true, updatedAt: true } },
  inventoryAdjustments: {
    select: { createdAt: true },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
} satisfies Prisma.ProductVariantSelect;

export const inventoryDetailSelect = {
  id: true,
  sku: true,
  size: true,
  color: true,
  createdAt: true,
  updatedAt: true,
  product: {
    select: {
      name: true,
      slug: true,
      isActive: true,
      category: { select: { name: true, slug: true } },
    },
  },
  inventory: { select: { quantity: true, updatedAt: true } },
  inventoryAdjustments: {
    select: { createdAt: true },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
  },
} satisfies Prisma.ProductVariantSelect;

export const adjustmentSelect = {
  id: true,
  idempotencyKey: true,
  variantId: true,
  adminUserId: true,
  quantityBefore: true,
  quantityDelta: true,
  quantityAfter: true,
  reason: true,
  note: true,
  productName: true,
  productSlug: true,
  sku: true,
  size: true,
  color: true,
  adminEmail: true,
  createdAt: true,
} satisfies Prisma.InventoryAdjustmentSelect;

type InventoryListRow = Prisma.ProductVariantGetPayload<{ select: typeof inventoryListSelect }>;
type InventoryDetailRow = Prisma.ProductVariantGetPayload<{ select: typeof inventoryDetailSelect }>;
export type AdjustmentRow = Prisma.InventoryAdjustmentGetPayload<{ select: typeof adjustmentSelect }>;

export function stockState(inventory: { quantity: number } | null) {
  if (!inventory) return "MISSING_INVENTORY" as const;
  return inventory.quantity === 0 ? "OUT_OF_STOCK" as const : "IN_STOCK" as const;
}

export function serializeInventoryListItem(row: InventoryListRow) {
  return {
    variantId: row.id,
    product: row.product,
    variant: { sku: row.sku, size: row.size, color: row.color },
    inventory: row.inventory ? {
      quantity: row.inventory.quantity,
      updatedAt: row.inventory.updatedAt.toISOString(),
      state: stockState(row.inventory),
    } : { quantity: null, updatedAt: null, state: stockState(null) },
    lastManualAdjustmentAt: row.inventoryAdjustments[0]?.createdAt.toISOString() ?? null,
  };
}

export function serializeInventoryDetail(row: InventoryDetailRow) {
  return {
    ...serializeInventoryListItem(row),
    variant: {
      sku: row.sku,
      size: row.size,
      color: row.color,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

export function serializeAdjustment(row: AdjustmentRow) {
  return {
    id: row.id,
    quantityBefore: row.quantityBefore,
    quantityDelta: row.quantityDelta,
    quantityAfter: row.quantityAfter,
    reason: row.reason,
    note: row.note,
    product: { name: row.productName, slug: row.productSlug },
    variant: { sku: row.sku, size: row.size, color: row.color },
    administrator: { email: row.adminEmail },
    createdAt: row.createdAt.toISOString(),
  };
}

export type AdminInventoryListItem = ReturnType<typeof serializeInventoryListItem>;
export type AdminInventoryDetail = ReturnType<typeof serializeInventoryDetail>;
export type AdminInventoryAdjustment = ReturnType<typeof serializeAdjustment>;
