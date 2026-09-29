BEGIN;

ALTER TABLE "ProductVariant"
ADD COLUMN "salePrice" DECIMAL(10,2),
ADD COLUMN "saleStartsAt" TIMESTAMPTZ(3),
ADD COLUMN "saleEndsAt" TIMESTAMPTZ(3);

ALTER TABLE "ProductVariant"
ADD CONSTRAINT "ProductVariant_sale_price_positive_check"
CHECK ("salePrice" IS NULL OR "salePrice" > 0),
ADD CONSTRAINT "ProductVariant_sale_price_below_base_check"
CHECK ("salePrice" IS NULL OR "salePrice" < "price"),
ADD CONSTRAINT "ProductVariant_sale_schedule_requires_price_check"
CHECK ("salePrice" IS NOT NULL OR ("saleStartsAt" IS NULL AND "saleEndsAt" IS NULL)),
ADD CONSTRAINT "ProductVariant_sale_schedule_order_check"
CHECK ("saleStartsAt" IS NULL OR "saleEndsAt" IS NULL OR "saleEndsAt" > "saleStartsAt");

COMMIT;
