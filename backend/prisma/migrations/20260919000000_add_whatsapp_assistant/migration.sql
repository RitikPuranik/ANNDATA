-- WhatsApp Farmer Assistant.
--
-- Purely additive: three new enums and three new tables. No existing table,
-- column, index, or enum value is altered or dropped. The `whatsAppLink`
-- back-relation added to the Prisma `User` model has no DDL of its own — it is
-- the reverse side of the foreign key declared below on `whatsapp_links`.
--
-- (Separately, two Prisma-only back-relation fields — `CropLot.Delivery` and
-- `Shipment.Delivery` — and two relation *names* on `LogisticsQuote` were added
-- to prisma/schema.prisma so that the schema validates. They are reverse sides
-- of foreign keys that already exist in earlier migrations and need no DDL.)
--
-- Hand-authored against prisma/schema.prisma because the build sandbox cannot
-- reach binaries.prisma.sh (see prisma/README-engines.md). Run
-- `npx prisma migrate deploy` and then `npx prisma generate` on a machine with
-- normal network access. If you prefer to verify the DDL first, run
-- `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma
--  --to-schema-datamodel prisma/schema.prisma --script` afterwards; it should
-- report no drift.

CREATE TYPE "WhatsAppConversationState" AS ENUM (
    'IDLE',
    'COLLECTING_CROP',
    'COLLECTING_QUANTITY',
    'COLLECTING_LOCATION',
    'COLLECTING_QUALITY',
    'COLLECTING_FARM',
    'COLLECTING_PRICE',
    'AWAITING_CONFIRMATION',
    'MATCHING',
    'SHOWING_BUYERS',
    'SHOWING_OFFERS',
    'SHOWING_LOTS',
    'SHOWING_PAYMENT',
    'SHOWING_SHIPMENT'
);

CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TYPE "WhatsAppMessageStatus" AS ENUM (
    'RECEIVED',
    'PROCESSING',
    'PROCESSED',
    'IGNORED',
    'FAILED',
    'QUEUED',
    'SENT',
    'DELIVERED',
    'READ'
);

-- ---------------------------------------------------------------------
-- WhatsAppLink
-- ---------------------------------------------------------------------

CREATE TABLE "whatsapp_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_links_userId_key" ON "whatsapp_links"("userId");
CREATE UNIQUE INDEX "whatsapp_links_phoneNumber_key" ON "whatsapp_links"("phoneNumber");

ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- WhatsAppConversation
-- ---------------------------------------------------------------------

CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "userId" TEXT,
    "state" "WhatsAppConversationState" NOT NULL DEFAULT 'IDLE',
    "intent" TEXT,
    "collectedEntities" JSONB NOT NULL DEFAULT '{}',
    "context" JSONB NOT NULL DEFAULT '{}',
    "language" TEXT NOT NULL DEFAULT 'hinglish',
    "lastInboundAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_conversations_phoneNumber_key" ON "whatsapp_conversations"("phoneNumber");
CREATE INDEX "whatsapp_conversations_userId_idx" ON "whatsapp_conversations"("userId");
CREATE INDEX "whatsapp_conversations_expiresAt_idx" ON "whatsapp_conversations"("expiresAt");

-- ---------------------------------------------------------------------
-- WhatsAppMessage
-- ---------------------------------------------------------------------

CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "conversationId" TEXT,
    "userId" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "messageType" TEXT NOT NULL,
    "text" TEXT,
    "payload" JSONB,
    "status" "WhatsAppMessageStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_messages_externalMessageId_key" ON "whatsapp_messages"("externalMessageId");
CREATE INDEX "whatsapp_messages_conversationId_idx" ON "whatsapp_messages"("conversationId");
CREATE INDEX "whatsapp_messages_userId_idx" ON "whatsapp_messages"("userId");
CREATE INDEX "whatsapp_messages_phoneNumber_idx" ON "whatsapp_messages"("phoneNumber");
CREATE INDEX "whatsapp_messages_status_receivedAt_idx" ON "whatsapp_messages"("status", "receivedAt");
CREATE INDEX "whatsapp_messages_createdAt_idx" ON "whatsapp_messages"("createdAt");

ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
