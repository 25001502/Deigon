-- Add the catalogue fields that were previously only present in lib/data/catalog.ts.
ALTER TABLE "Product"
  ADD COLUMN "badge" TEXT,
  ADD COLUMN "details" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
