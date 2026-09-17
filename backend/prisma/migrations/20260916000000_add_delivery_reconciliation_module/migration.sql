-- Module 18 — Delivery & Quality Reconciliation.
--
-- Purely additive: five new enums and six new tables. No existing table,
-- column, index, or enum value is altered or dropped. The back-relations
-- added to the Prisma `Shipment` (`delivery`), `CropLot` (`deliveries`),
-- `TradeOffer` (`deliveries`), and `BuyerProfile` (`deliveries`) models
-- have no DDL of their own — they are the reverse side of the foreign
-- keys declared below on `deliveries` and require no schema change to the
-- tables they point at (same convention noted in Module 15's own
-- migration for its back-relation onto `users`).
--
-- This migration was hand-authored against the Prisma schema because this
-- build sandbox cannot reach binaries.prisma.sh to run `prisma migrate
-- dev` itself (see backend/prisma/README-engines.md — Modules 16 and 17
-- hit the identical wall and also have no generated migration files of
-- their own yet). Every column/type/constraint below was cross-checked
-- field-by-field against prisma/schema.prisma's own Module 18 section.
-- Run `npx prisma migrate resolve --applied 20260916000000_add_delivery_reconciliation_module`
-- after applying this by hand (e.g. via `psql`), or just run
-- `npx prisma migrate deploy` directly once you have normal network
-- access — either way, always run `npx prisma generate` afterwards so the
-- TypeScript client actually exposes `prisma.delivery` etc.

CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'RECEIVED', 'UNDER_INSPECTION', 'PARTIALLY_ACCEPTED', 'ACCEPTED', 'REJECTED', 'RECONCILED', 'CANCELLED');

CREATE TYPE "DeliveryQuantityResult" AS ENUM ('SHORT', 'EXACT', 'EXCESS');

CREATE TYPE "DeliveryQualityResult" AS ENUM ('PASS', 'PARTIAL', 'FAIL', 'PENDING');

CREATE TYPE "WeighingMethod" AS ENUM ('WEIGHBRIDGE', 'ELECTRONIC_SCALE', 'MANUAL', 'OTHER');

CREATE TYPE "DeliveryEvidenceType" AS ENUM ('WEIGHMENT_SLIP', 'DELIVERY_RECEIPT', 'QUALITY_CERTIFICATE', 'INSPECTION_DOCUMENT', 'PHOTOGRAPH', 'OTHER');

-- ---------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------

CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "deliveryNumber" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "tradeOfferId" TEXT,
    "buyerId" TEXT NOT NULL,
    "expectedQuantityKg" DECIMAL(14,2) NOT NULL,
    "deliveredQuantityKg" DECIMAL(14,2),
    "acceptedQuantityKg" DECIMAL(14,2),
    "rejectedQuantityKg" DECIMAL(14,2),
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deliveries_publicId_key" ON "deliveries"("publicId");
CREATE UNIQUE INDEX "deliveries_deliveryNumber_key" ON "deliveries"("deliveryNumber");
CREATE UNIQUE INDEX "deliveries_shipmentId_key" ON "deliveries"("shipmentId");
CREATE INDEX "deliveries_lotId_idx" ON "deliveries"("lotId");
CREATE INDEX "deliveries_buyerId_status_idx" ON "deliveries"("buyerId", "status");
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");
CREATE INDEX "deliveries_createdAt_idx" ON "deliveries"("createdAt");

ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "crop_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "trade_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- DeliveryWeighment
-- ---------------------------------------------------------------------

CREATE TABLE "delivery_weighments" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "grossWeightKg" DECIMAL(14,2) NOT NULL,
    "tareWeightKg" DECIMAL(14,2) NOT NULL,
    "netWeightKg" DECIMAL(14,2) NOT NULL,
    "weightUnit" "QuantityUnit" NOT NULL DEFAULT 'KG',
    "weighingMethod" "WeighingMethod" NOT NULL DEFAULT 'WEIGHBRIDGE',
    "weighingTimestamp" TIMESTAMP(3) NOT NULL,
    "scaleReference" TEXT,
    "recordedByUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_weighments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_weighments_deliveryId_createdAt_idx" ON "delivery_weighments"("deliveryId", "createdAt");

ALTER TABLE "delivery_weighments" ADD CONSTRAINT "delivery_weighments_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- DeliveryQualityAssessment
-- ---------------------------------------------------------------------

CREATE TABLE "delivery_quality_assessments" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "inspectorUserId" TEXT,
    "overallGrade" "QualityGrade",
    "overallResult" "DeliveryQualityResult" NOT NULL DEFAULT 'PENDING',
    "algorithmVersion" TEXT NOT NULL DEFAULT 'v1',
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_quality_assessments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_quality_assessments_publicId_key" ON "delivery_quality_assessments"("publicId");
CREATE INDEX "delivery_quality_assessments_deliveryId_createdAt_idx" ON "delivery_quality_assessments"("deliveryId", "createdAt");

ALTER TABLE "delivery_quality_assessments" ADD CONSTRAINT "delivery_quality_assessments_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- DeliveryQualityObservation
-- ---------------------------------------------------------------------

CREATE TABLE "delivery_quality_observations" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "metricCode" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "unit" TEXT,
    "expectedMin" DECIMAL(10,2),
    "expectedMax" DECIMAL(10,2),
    "passed" BOOLEAN NOT NULL,
    "variance" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_quality_observations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_quality_observations_assessmentId_idx" ON "delivery_quality_observations"("assessmentId");

ALTER TABLE "delivery_quality_observations" ADD CONSTRAINT "delivery_quality_observations_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "delivery_quality_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- DeliveryReconciliation
-- ---------------------------------------------------------------------

CREATE TABLE "delivery_reconciliations" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "expectedQuantityKg" DECIMAL(14,2) NOT NULL,
    "deliveredQuantityKg" DECIMAL(14,2) NOT NULL,
    "acceptedQuantityKg" DECIMAL(14,2) NOT NULL,
    "quantityVarianceKg" DECIMAL(14,2) NOT NULL,
    "quantityTolerancePercent" DECIMAL(5,2) NOT NULL,
    "quantityResult" "DeliveryQuantityResult" NOT NULL,
    "qualityResult" "DeliveryQualityResult" NOT NULL,
    "overallStatus" "DeliveryStatus" NOT NULL,
    "explanation" JSONB NOT NULL,
    "algorithmVersion" TEXT NOT NULL DEFAULT 'v1',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_reconciliations_publicId_key" ON "delivery_reconciliations"("publicId");
CREATE INDEX "delivery_reconciliations_deliveryId_calculatedAt_idx" ON "delivery_reconciliations"("deliveryId", "calculatedAt");

ALTER TABLE "delivery_reconciliations" ADD CONSTRAINT "delivery_reconciliations_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- DeliveryEvidence
-- ---------------------------------------------------------------------

CREATE TABLE "delivery_evidence" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "evidenceType" "DeliveryEvidenceType" NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "secureUrl" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_evidence_deliveryId_idx" ON "delivery_evidence"("deliveryId");

ALTER TABLE "delivery_evidence" ADD CONSTRAINT "delivery_evidence_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
