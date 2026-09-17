-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "providerCheckoutId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerCheckoutId_key" ON "Payment"("providerCheckoutId");
