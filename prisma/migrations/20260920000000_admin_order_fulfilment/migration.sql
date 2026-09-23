ALTER TABLE "Order"
ADD COLUMN "processingAt" TIMESTAMP(3),
ADD COLUMN "shippedAt" TIMESTAMP(3),
ADD COLUMN "readyForPickupAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "estimatedDeliveryDate" DATE;
