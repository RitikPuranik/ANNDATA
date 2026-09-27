-- Module 23 (Part 1) — Low-Connectivity Offline Sync & Preloading.
--
-- Purely additive: two new enums and two new tables (sync_sessions,
-- sync_packets). No existing table, column, index, or enum value is
-- altered or dropped. sync_sessions.userId is a real foreign key onto
-- users(id) with ON DELETE CASCADE — same reasoning as
-- notifications.recipientUserId in the Module 22 migration: an offline
-- action queue has no independent meaning once its only owner is gone.
-- sync_packets.sessionId cascades from its parent session for the same
-- reason.
--
-- Hand-authored for the same reason as the Module 16/17/18/19/20/21/22
-- migrations before it: this build sandbox cannot reach binaries.prisma.sh
-- to run `prisma migrate dev`/`generate` itself. Every column/type/
-- constraint below was cross-checked field-by-field against
-- prisma/schema.prisma's own Module 23 section.
--
-- Run `npx prisma migrate resolve --applied 20260928000000_add_low_connectivity_sync`
-- after applying this by hand (e.g. via `psql`), or just run
-- `npx prisma migrate deploy` directly once you have normal network
-- access — either way, always run `npx prisma generate` afterwards so the
-- TypeScript client actually exposes `prisma.syncSession` / `prisma.syncPacket`.

CREATE TYPE "SyncSessionStatus" AS ENUM ('OPEN', 'COMPLETED', 'ABANDONED');

CREATE TYPE "SyncPacketStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPLIED', 'FAILED');

CREATE TABLE "sync_sessions" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "SyncSessionStatus" NOT NULL DEFAULT 'OPEN',
    "clientAppVersion" TEXT,
    "networkProfile" TEXT,
    "lastAppliedSequence" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_sessions_publicId_key" ON "sync_sessions"("publicId");
CREATE INDEX "sync_sessions_userId_deviceId_status_idx" ON "sync_sessions"("userId", "deviceId", "status");
CREATE INDEX "sync_sessions_userId_status_idx" ON "sync_sessions"("userId", "status");

ALTER TABLE "sync_sessions" ADD CONSTRAINT "sync_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sync_packets" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "targetModule" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncPacketStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "resultSummary" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "clientCreatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_packets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_packets_publicId_key" ON "sync_packets"("publicId");
CREATE UNIQUE INDEX "sync_packets_sessionId_sequence_key" ON "sync_packets"("sessionId", "sequence");
CREATE UNIQUE INDEX "sync_packets_userId_idempotencyKey_key" ON "sync_packets"("userId", "idempotencyKey");
CREATE INDEX "sync_packets_sessionId_status_idx" ON "sync_packets"("sessionId", "status");
CREATE INDEX "sync_packets_userId_createdAt_idx" ON "sync_packets"("userId", "createdAt");

ALTER TABLE "sync_packets" ADD CONSTRAINT "sync_packets_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sync_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
