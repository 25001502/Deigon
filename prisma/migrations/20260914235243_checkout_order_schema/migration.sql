/*
  Warnings:

  - You are about to drop the column `price` on the `OrderItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[idempotencyKey]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `customerEmail` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerName` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fulfilmentType` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `idempotencyKey` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shippingFee` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotal` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lineTotal` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sku` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitPrice` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FulfilmentType" AS ENUM ('DELIVERY', 'PICKUP');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'READY_FOR_PICKUP';

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_addressId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_variantId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "customerEmail" TEXT NOT NULL,
ADD COLUMN     "customerName" TEXT NOT NULL,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "fulfilmentType" "FulfilmentType" NOT NULL,
ADD COLUMN     "idempotencyKey" TEXT NOT NULL,
ADD COLUMN     "inventoryReleasedAt" TIMESTAMP(3),
ADD COLUMN     "pickupLocation" TEXT,
ADD COLUMN     "shippingAddressLine1" TEXT,
ADD COLUMN     "shippingAddressLine2" TEXT,
ADD COLUMN     "shippingCity" TEXT,
ADD COLUMN     "shippingCountry" TEXT,
ADD COLUMN     "shippingFee" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "shippingPostalCode" TEXT,
ADD COLUMN     "shippingProvince" TEXT,
ADD COLUMN     "subtotal" DECIMAL(10,2) NOT NULL,
ALTER COLUMN "addressId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "price",
ADD COLUMN     "color" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "lineTotal" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "size" TEXT,
ADD COLUMN     "sku" TEXT NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "unitPrice" DECIMAL(10,2) NOT NULL,
ALTER COLUMN "productId" DROP NOT NULL,
ALTER COLUMN "variantId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
