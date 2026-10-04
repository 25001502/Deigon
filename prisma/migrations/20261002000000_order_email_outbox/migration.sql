BEGIN;

CREATE TYPE "OrderEmailEventType" AS ENUM (
    'ORDER_CONFIRMED',
    'ORDER_PROCESSING',
    'ORDER_SHIPPED',
    'ORDER_READY_FOR_PICKUP',
    'ORDER_COMPLETED'
);

CREATE TYPE "OrderEmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DEAD');

CREATE TABLE "OrderEmailOutbox" (
    "id" TEXT NOT NULL,
    "eventType" "OrderEmailEventType" NOT NULL,
    "status" "OrderEmailStatus" NOT NULL DEFAULT 'PENDING',
    "recipientEmail" VARCHAR(320) NOT NULL,
    "recipientName" VARCHAR(200) NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "renderedSubject" TEXT,
    "renderedHtml" TEXT,
    "renderedText" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMPTZ(3),
    "claimToken" VARCHAR(128),
    "lastAttemptAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "providerMessageId" VARCHAR(255),
    "lastErrorCode" VARCHAR(100),
    "lastError" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "OrderEmailOutbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderEmailOutbox_attempt_count_nonnegative_check" CHECK ("attemptCount" >= 0),
    CONSTRAINT "OrderEmailOutbox_template_version_positive_check" CHECK ("templateVersion" >= 1),
    CONSTRAINT "OrderEmailOutbox_rendered_content_complete_check" CHECK (
        ("renderedSubject" IS NULL AND "renderedHtml" IS NULL AND "renderedText" IS NULL)
        OR
        ("renderedSubject" IS NOT NULL AND "renderedHtml" IS NOT NULL AND "renderedText" IS NOT NULL)
    ),
    CONSTRAINT "OrderEmailOutbox_sending_claim_check" CHECK (
        "status" <> 'SENDING' OR ("claimedAt" IS NOT NULL AND "claimToken" IS NOT NULL)
    ),
    CONSTRAINT "OrderEmailOutbox_sent_provider_check" CHECK (
        "status" <> 'SENT' OR ("sentAt" IS NOT NULL AND "providerMessageId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "OrderEmailOutbox_providerMessageId_key"
ON "OrderEmailOutbox"("providerMessageId");

CREATE UNIQUE INDEX "OrderEmailOutbox_orderId_eventType_key"
ON "OrderEmailOutbox"("orderId", "eventType");

CREATE INDEX "OrderEmailOutbox_status_nextAttemptAt_createdAt_idx"
ON "OrderEmailOutbox"("status", "nextAttemptAt", "createdAt");

CREATE INDEX "OrderEmailOutbox_status_claimedAt_idx"
ON "OrderEmailOutbox"("status", "claimedAt");

ALTER TABLE "OrderEmailOutbox"
ADD CONSTRAINT "OrderEmailOutbox_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
