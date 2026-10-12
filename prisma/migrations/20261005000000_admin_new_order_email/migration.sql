BEGIN;

ALTER TYPE "OrderEmailEventType" ADD VALUE 'ADMIN_NEW_ORDER';

ALTER TABLE "OrderEmailOutbox"
ADD COLUMN "recipientKey" VARCHAR(320) NOT NULL DEFAULT 'customer';

DROP INDEX "OrderEmailOutbox_orderId_eventType_key";

CREATE UNIQUE INDEX "OrderEmailOutbox_orderId_eventType_recipientKey_key"
ON "OrderEmailOutbox"("orderId", "eventType", "recipientKey");

ALTER TABLE "OrderEmailOutbox"
ADD CONSTRAINT "OrderEmailOutbox_recipient_key_check" CHECK (
    CASE WHEN "eventType"::text = 'ADMIN_NEW_ORDER' THEN
        "recipientKey" = lower(btrim("recipientEmail"))
        AND "recipientKey" <> 'customer'
    ELSE "recipientKey" = 'customer'
    END
);

COMMIT;
