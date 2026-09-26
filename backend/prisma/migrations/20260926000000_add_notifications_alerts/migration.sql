-- Module 22 — Notifications & Alerts.
--
-- Purely additive: six new enums and four new tables (notifications,
-- notification_deliveries, notification_preferences,
-- notification_announcements). No existing table, column, index, or enum
-- value is altered or dropped. notifications.recipientUserId is a real
-- foreign key onto users(id) with ON DELETE CASCADE (a deleted user's own
-- notifications go with them — unlike every historical financial/dispute
-- record elsewhere in this codebase, a notification has no independent
-- meaning once its only recipient is gone). notification_preferences.userId
-- is the same one-row-per-user shape as whatsapp_links.userId.
--
-- Hand-authored for the same reason as the Module 16/17/18/19/20/21
-- migrations before it: this build sandbox cannot reach binaries.prisma.sh
-- to run `prisma migrate dev`/`generate` itself. Every column/type/
-- constraint below was cross-checked field-by-field against
-- prisma/schema.prisma's own Module 22 section.
--
-- Run `npx prisma migrate resolve --applied 20260926000000_add_notifications_alerts`
-- after applying this by hand (e.g. via `psql`), or just run
-- `npx prisma migrate deploy` directly once you have normal network
-- access — either way, always run `npx prisma generate` afterwards so the
-- TypeScript client actually exposes `prisma.notification` /
-- `prisma.notificationDelivery` / `prisma.notificationPreference` /
-- `prisma.notificationAnnouncement`.

CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'WHATSAPP', 'EMAIL', 'SMS');

CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

CREATE TYPE "NotificationCategory" AS ENUM (
    'OFFER',
    'PAYMENT',
    'SHIPMENT',
    'QUALITY',
    'DISPUTE',
    'LOGISTICS',
    'MARKET',
    'FORECAST',
    'SELL_STORE',
    'LOT',
    'ACCOUNT_SECURITY',
    'SYSTEM'
);

CREATE TYPE "NotificationType" AS ENUM (
    'OFFER_RECEIVED',
    'OFFER_ACCEPTED',
    'OFFER_REJECTED',
    'OFFER_EXPIRED',
    'PAYMENT_PENDING',
    'PAYMENT_RECEIVED',
    'PAYMENT_PARTIAL',
    'PAYMENT_COMPLETED',
    'PAYMENT_FAILED',
    'SHIPMENT_CREATED',
    'TRANSPORTER_ASSIGNED',
    'SHIPMENT_DISPATCHED',
    'SHIPMENT_IN_TRANSIT',
    'SHIPMENT_DELAYED',
    'SHIPMENT_DELIVERED',
    'QUALITY_CHECK_COMPLETED',
    'QUALITY_MISMATCH',
    'DELIVERY_RECONCILIATION_COMPLETED',
    'DISPUTE_CREATED',
    'DISPUTE_RESPONSE_REQUIRED',
    'DISPUTE_UPDATED',
    'DISPUTE_RESOLVED',
    'DISPUTE_REJECTED',
    'DISPUTE_REOPENED',
    'DISPUTE_CLOSED',
    'LOGISTICS_QUOTE_RECEIVED',
    'LOGISTICS_QUOTE_EXPIRED',
    'MARKET_PRICE_ALERT',
    'MARKET_TREND_ALERT',
    'FORECAST_ALERT',
    'LOT_CREATED',
    'LOT_UPDATED',
    'LOT_STATUS_CHANGED',
    'ACCOUNT_SECURITY_ALERT',
    'PASSWORD_CHANGED',
    'LOGIN_ALERT',
    'SYSTEM_ANNOUNCEMENT'
);

CREATE TYPE "NotificationSourceModule" AS ENUM (
    'MODULE_13_TRADE_OFFER',
    'MODULE_16_LOGISTICS',
    'MODULE_17_SHIPMENT',
    'MODULE_18_DELIVERY',
    'MODULE_19_PAYMENT',
    'MODULE_20_LEDGER',
    'MODULE_21_DISPUTE',
    'MODULE_6_MARKET',
    'MODULE_7_FORECAST',
    'MODULE_8_SELL_STORE',
    'MODULE_4_LOT',
    'MODULE_1_SECURITY',
    'ADMIN_ANNOUNCEMENT'
);

CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "sourceModule" "NotificationSourceModule" NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_publicId_key" ON "notifications"("publicId");
CREATE UNIQUE INDEX "notification_idempotency_key" ON "notifications"("sourceModule", "sourceEventId", "recipientUserId", "type");
CREATE INDEX "notifications_recipientUserId_readAt_idx" ON "notifications"("recipientUserId", "readAt");
CREATE INDEX "notifications_recipientUserId_createdAt_idx" ON "notifications"("recipientUserId", "createdAt");
CREATE INDEX "notifications_recipientUserId_category_idx" ON "notifications"("recipientUserId", "category");
CREATE INDEX "notifications_recipientUserId_priority_idx" ON "notifications"("recipientUserId", "priority");
CREATE INDEX "notifications_type_idx" ON "notifications"("type");
CREATE INDEX "notifications_sourceModule_sourceEventId_idx" ON "notifications"("sourceModule", "sourceEventId");
CREATE INDEX "notifications_relatedEntityType_relatedEntityId_idx" ON "notifications"("relatedEntityType", "relatedEntityId");
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_deliveries_notificationId_channel_key" ON "notification_deliveries"("notificationId", "channel");
CREATE INDEX "notification_deliveries_status_channel_idx" ON "notification_deliveries"("status", "channel");
CREATE INDEX "notification_deliveries_status_lastAttemptAt_idx" ON "notification_deliveries"("status", "lastAttemptAt");

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStartHour" INTEGER,
    "quietHoursEndHour" INTEGER,
    "categoryOverrides" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notification_announcements" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "audienceRole" "UserRole",
    "createdByUserId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_announcements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_announcements_publicId_key" ON "notification_announcements"("publicId");
CREATE INDEX "notification_announcements_publishedAt_idx" ON "notification_announcements"("publishedAt");
CREATE INDEX "notification_announcements_scheduledFor_idx" ON "notification_announcements"("scheduledFor");
