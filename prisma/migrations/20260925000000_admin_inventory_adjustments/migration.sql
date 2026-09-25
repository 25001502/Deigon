-- CreateEnum
BEGIN;

CREATE TYPE "InventoryAdjustmentReason" AS ENUM ('RESTOCK', 'CORRECTION', 'DAMAGE', 'RETURN', 'OTHER');

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" "InventoryAdjustmentReason" NOT NULL,
    "note" TEXT,
    "productName" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "adminUserId" TEXT,
    "adminEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "variantId" TEXT NOT NULL,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryAdjustment_nonzero_delta_check" CHECK ("quantityDelta" <> 0),
    CONSTRAINT "InventoryAdjustment_nonnegative_quantities_check" CHECK ("quantityBefore" >= 0 AND "quantityAfter" >= 0),
    CONSTRAINT "InventoryAdjustment_arithmetic_check" CHECK ("quantityAfter"::bigint = "quantityBefore"::bigint + "quantityDelta"::bigint)
);

-- Existing rows must be checked before production deployment. NOT VALID keeps constraint creation additive,
-- and VALIDATE performs the explicit verification without rewriting the Inventory table.
ALTER TABLE "Inventory"
ADD CONSTRAINT "Inventory_quantity_nonnegative_check" CHECK ("quantity" >= 0) NOT VALID;

ALTER TABLE "Inventory"
VALIDATE CONSTRAINT "Inventory_quantity_nonnegative_check";

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAdjustment_idempotencyKey_key" ON "InventoryAdjustment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryAdjustment_variantId_createdAt_idx" ON "InventoryAdjustment"("variantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InventoryAdjustment_adminUserId_createdAt_idx" ON "InventoryAdjustment"("adminUserId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
