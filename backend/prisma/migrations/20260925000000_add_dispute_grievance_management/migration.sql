-- Module 21 — Dispute & Grievance Management.
--
-- Purely additive: ten new enums and four new tables (disputes,
-- dispute_evidence, dispute_comments, dispute_history_events). No existing
-- table, column, index, or enum value is altered or dropped. Reference
-- columns onto Module 1/2/4/7/13/17/18/19 (raisedByUserId, assignedToUserId,
-- farmerId, buyerId, transporterId, lotId, tradeOfferId, shipmentId,
-- deliveryId, paymentObligationId) are real foreign keys with
-- ON DELETE SET NULL/RESTRICT as declared in the Prisma schema, mirroring
-- Delivery.tradeOfferId's own SetNull convention, so a dispute's history
-- survives even if a referenced transaction row is later removed.
--
-- Hand-authored for the same reason as the Module 16/17/18/19/20 migrations
-- before it: this build sandbox cannot reach binaries.prisma.sh to run
-- `prisma migrate dev` itself. Every column/type/constraint below was
-- cross-checked field-by-field against prisma/schema.prisma's own
-- Module 21 section.
--
-- Run `npx prisma migrate resolve --applied 20260925000000_add_dispute_grievance_management`
-- after applying this by hand (e.g. via `psql`), or just run
-- `npx prisma migrate deploy` directly once you have normal network
-- access — either way, always run `npx prisma generate` afterwards so the
-- TypeScript client actually exposes `prisma.dispute` / `prisma.disputeEvidence`
-- / `prisma.disputeComment` / `prisma.disputeHistoryEvent`.

CREATE TYPE "DisputeType" AS ENUM (
    'QUALITY_DISPUTE',
    'QUANTITY_DISPUTE',
    'PRICE_DISPUTE',
    'PAYMENT_DISPUTE',
    'DELIVERY_DISPUTE',
    'LOGISTICS_DISPUTE',
    'DAMAGE_DISPUTE',
    'REJECTION_DISPUTE',
    'DELAY_DISPUTE',
    'OFFER_DISPUTE',
    'WEIGHT_DISPUTE',
    'GRIEVANCE',
    'OTHER'
);

CREATE TYPE "DisputeCategory" AS ENUM ('TRANSACTION', 'GRIEVANCE');

CREATE TYPE "DisputeStatus" AS ENUM (
    'OPEN',
    'UNDER_REVIEW',
    'INVESTIGATION',
    'AWAITING_PARTY_RESPONSE',
    'RESOLUTION_PROPOSED',
    'RESOLVED',
    'REJECTED',
    'CLOSED',
    'CANCELLED'
);

CREATE TYPE "DisputePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "DisputeRaisedByRole" AS ENUM ('FARMER', 'FPO_ADMIN', 'BUYER', 'TRANSPORTER', 'ADMIN');

CREATE TYPE "DisputeResolutionCode" AS ENUM (
    'NO_ACTION_REQUIRED',
    'CLAIM_REJECTED',
    'CLAIM_ACCEPTED',
    'PARTIAL_CLAIM_ACCEPTED',
    'REFUND_REQUIRED',
    'PAYMENT_ADJUSTMENT_REQUIRED',
    'QUANTITY_ADJUSTMENT',
    'QUALITY_ADJUSTMENT',
    'DELIVERY_ADJUSTMENT',
    'LOGISTICS_ADJUSTMENT',
    'OTHER'
);

CREATE TYPE "DisputeEvidenceType" AS ENUM (
    'IMAGE',
    'DOCUMENT',
    'DELIVERY_PROOF',
    'QUALITY_REPORT',
    'WEIGHING_RECORD',
    'PAYMENT_REFERENCE',
    'SHIPMENT_INFORMATION',
    'OTHER'
);

CREATE TYPE "DisputeCommentVisibility" AS ENUM ('PUBLIC_COMMENT', 'INTERNAL_NOTE');

CREATE TYPE "DisputeHistoryEventType" AS ENUM (
    'CREATED',
    'STATUS_CHANGED',
    'ASSIGNED',
    'UNASSIGNED',
    'COMMENT_ADDED',
    'EVIDENCE_ADDED',
    'EVIDENCE_REMOVED',
    'INVESTIGATION_STARTED',
    'RESPONSE_REQUESTED',
    'RESOLUTION_PROPOSED',
    'RESOLVED',
    'REJECTED',
    'REOPENED',
    'CLOSED',
    'CANCELLED',
    'FINANCIAL_ADJUSTMENT_REQUESTED',
    'FINANCIAL_ADJUSTMENT_COMPLETED'
);

CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "disputeNumber" TEXT NOT NULL,
    "type" "DisputeType" NOT NULL,
    "category" "DisputeCategory" NOT NULL DEFAULT 'TRANSACTION',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "DisputePriority" NOT NULL DEFAULT 'MEDIUM',
    "raisedByUserId" TEXT NOT NULL,
    "raisedByRole" "DisputeRaisedByRole" NOT NULL,
    "farmerId" TEXT,
    "buyerId" TEXT,
    "transporterId" TEXT,
    "lotId" TEXT,
    "tradeOfferId" TEXT,
    "shipmentId" TEXT,
    "deliveryId" TEXT,
    "paymentObligationId" TEXT,
    "ledgerEntryId" TEXT,
    "assignedToUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedByUserId" TEXT,
    "resolutionCode" "DisputeResolutionCode",
    "resolutionSummary" TEXT,
    "requestedResolution" TEXT,
    "finalResolution" TEXT,
    "financialAdjustmentPaymentObligationId" TEXT,
    "financialAdjustmentLedgerEntryId" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "disputes_publicId_key" ON "disputes"("publicId");
CREATE UNIQUE INDEX "disputes_disputeNumber_key" ON "disputes"("disputeNumber");
CREATE INDEX "disputes_status_idx" ON "disputes"("status");
CREATE INDEX "disputes_category_idx" ON "disputes"("category");
CREATE INDEX "disputes_type_idx" ON "disputes"("type");
CREATE INDEX "disputes_priority_idx" ON "disputes"("priority");
CREATE INDEX "disputes_raisedByUserId_idx" ON "disputes"("raisedByUserId");
CREATE INDEX "disputes_farmerId_idx" ON "disputes"("farmerId");
CREATE INDEX "disputes_buyerId_idx" ON "disputes"("buyerId");
CREATE INDEX "disputes_transporterId_idx" ON "disputes"("transporterId");
CREATE INDEX "disputes_lotId_idx" ON "disputes"("lotId");
CREATE INDEX "disputes_tradeOfferId_idx" ON "disputes"("tradeOfferId");
CREATE INDEX "disputes_shipmentId_idx" ON "disputes"("shipmentId");
CREATE INDEX "disputes_deliveryId_idx" ON "disputes"("deliveryId");
CREATE INDEX "disputes_paymentObligationId_idx" ON "disputes"("paymentObligationId");
CREATE INDEX "disputes_assignedToUserId_idx" ON "disputes"("assignedToUserId");
CREATE INDEX "disputes_createdAt_idx" ON "disputes"("createdAt");
CREATE INDEX "disputes_updatedAt_idx" ON "disputes"("updatedAt");

ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "transporter_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "crop_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "trade_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_paymentObligationId_fkey" FOREIGN KEY ("paymentObligationId") REFERENCES "payment_obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "dispute_evidence" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "evidenceType" "DisputeEvidenceType" NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "secureUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "description" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,

    CONSTRAINT "dispute_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispute_evidence_disputeId_idx" ON "dispute_evidence"("disputeId");
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "dispute_comments" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "visibility" "DisputeCommentVisibility" NOT NULL DEFAULT 'PUBLIC_COMMENT',
    "authorUserId" TEXT NOT NULL,
    "authorRole" "DisputeRaisedByRole" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "dispute_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispute_comments_disputeId_createdAt_idx" ON "dispute_comments"("disputeId", "createdAt");
ALTER TABLE "dispute_comments" ADD CONSTRAINT "dispute_comments_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "dispute_history_events" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "eventType" "DisputeHistoryEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "DisputeRaisedByRole",
    "previousState" TEXT,
    "newState" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_history_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispute_history_events_disputeId_createdAt_idx" ON "dispute_history_events"("disputeId", "createdAt");
CREATE INDEX "dispute_history_events_eventType_idx" ON "dispute_history_events"("eventType");
ALTER TABLE "dispute_history_events" ADD CONSTRAINT "dispute_history_events_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
