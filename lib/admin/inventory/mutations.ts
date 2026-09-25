import "server-only";

import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api/errors";
import { requireAdmin, type AuthorizedAdmin } from "@/lib/auth/require-admin";
import { AuthError } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

import { POSTGRES_INT_MAX } from "./config";
import { inventoryAdjustmentInput, variantId } from "./input";
import {
  adjustmentSelect,
  inventoryDetailSelect,
  serializeAdjustment,
  serializeInventoryDetail,
  type AdjustmentRow,
} from "./serialize";
import type { InventoryAdjustmentInput } from "./types";

const transactionOptions = { maxWait: 5_000, timeout: 10_000 };

function operationMatches(row: AdjustmentRow, admin: AuthorizedAdmin, targetVariantId: string, input: InventoryAdjustmentInput) {
  return row.adminUserId === admin.id
    && row.variantId === targetVariantId
    && row.quantityBefore === input.expectedQuantity
    && row.quantityDelta === input.delta
    && row.reason === input.reason
    && row.note === input.note;
}

function idempotencyConflict(): never {
  throw new ApiError("Idempotency key is already in use for a different inventory adjustment", 409);
}

async function replayResult(admin: AuthorizedAdmin, targetVariantId: string, input: InventoryAdjustmentInput) {
  const row = await prisma.inventoryAdjustment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: adjustmentSelect,
  });
  if (!row) return null;
  if (!operationMatches(row, admin, targetVariantId, input)) idempotencyConflict();
  const detail = await prisma.productVariant.findUnique({ where: { id: targetVariantId }, select: inventoryDetailSelect });
  if (!detail) throw new ApiError("Product variant not found", 404);
  return { inventory: serializeInventoryDetail(detail), adjustment: serializeAdjustment(row), replayed: true };
}

export async function adjustAdminInventory(value: string, rawInput: unknown) {
  const admin = await requireAdmin();
  const targetVariantId = variantId(value);
  const input = inventoryAdjustmentInput(rawInput);
  const fastReplay = await replayResult(admin, targetVariantId, input);
  if (fastReplay) return fastReplay;

  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Inventory" WHERE "variantId" = ${targetVariantId} FOR UPDATE
      `;
      if (locked.length !== 1) {
        const exists = await tx.productVariant.findUnique({ where: { id: targetVariantId }, select: { id: true } });
        if (!exists) throw new ApiError("Product variant not found", 404);
        throw new ApiError("Product variant has no inventory record", 409);
      }

      // A same-variant duplicate waited on this lock. Recheck before any stale-state comparison.
      const existing = await tx.inventoryAdjustment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: adjustmentSelect,
      });
      if (existing) {
        if (!operationMatches(existing, admin, targetVariantId, input)) idempotencyConflict();
        const detail = await tx.productVariant.findUniqueOrThrow({ where: { id: targetVariantId }, select: inventoryDetailSelect });
        return { inventory: serializeInventoryDetail(detail), adjustment: serializeAdjustment(existing), replayed: true };
      }

      const variant = await tx.productVariant.findUnique({
        where: { id: targetVariantId },
        select: {
          id: true,
          sku: true,
          size: true,
          color: true,
          product: { select: { name: true, slug: true } },
          inventory: { select: { quantity: true, updatedAt: true } },
        },
      });
      if (!variant) throw new ApiError("Product variant not found", 404);
      if (!variant.inventory) throw new ApiError("Product variant has no inventory record", 409);
      if (variant.inventory.quantity !== input.expectedQuantity
        || variant.inventory.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new ApiError("Inventory changed before this adjustment. Reload and review the current stock", 409);
      }

      const quantityAfter = variant.inventory.quantity + input.delta;
      if (!Number.isSafeInteger(quantityAfter) || quantityAfter < 0 || quantityAfter > POSTGRES_INT_MAX) {
        throw new ApiError("Inventory adjustment would produce an invalid quantity", 409);
      }
      const actor = await tx.user.findUnique({ where: { id: admin.id }, select: { email: true, role: true } });
      if (!actor || actor.role !== "ADMIN") throw new AuthError("Admin privileges required", 403);

      await tx.inventory.update({ where: { variantId: targetVariantId }, data: { quantity: quantityAfter } });
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          variantId: targetVariantId,
          adminUserId: admin.id,
          adminEmail: actor.email,
          quantityBefore: variant.inventory.quantity,
          quantityDelta: input.delta,
          quantityAfter,
          reason: input.reason,
          note: input.note,
          productName: variant.product.name,
          productSlug: variant.product.slug,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
        },
        select: adjustmentSelect,
      });
      const detail = await tx.productVariant.findUniqueOrThrow({ where: { id: targetVariantId }, select: inventoryDetailSelect });
      return { inventory: serializeInventoryDetail(detail), adjustment: serializeAdjustment(adjustment), replayed: false };
    }, transactionOptions);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The failed transaction, including its inventory update, has rolled back. Never rerun it.
      const replay = await replayResult(admin, targetVariantId, input);
      if (replay) return replay;
    }
    throw error;
  }
}
