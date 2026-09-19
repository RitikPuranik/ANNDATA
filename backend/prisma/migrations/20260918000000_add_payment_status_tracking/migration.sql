-- Module 19 — Payment Status Tracking.
--
-- Purely additive: three new enums and two new tables. No existing
-- table, column, index, or enum value is altered or dropped. The
-- back-relations added to the Prisma `User` (`paymentsRecorded`),
-- `BuyerProfile` (`paymentObligations`), `FarmerProfile`
-- (`paymentObligations`), `Fpo` (`paymentObligations`), `TradeOffer`
-- (`paymentObligations`), and `Delivery` (`paymentObligation`) models
-- have no DDL of their own — they are the reverse side of the foreign
-- keys declared below on `payment_obligations` and `payment_records`
-- and require no schema change to the tables they point at (same
-- convention noted in Module 18's own migration for its back-relations
-- onto `shipments`/`crop_lots`/`trade_offers`/`buyer_profiles`).
--
-- This migration was hand-authored against the Prisma schema because
-- this build sandbox cannot reach binaries.prisma.sh to run `prisma
-- migrate dev` itself (see backend/prisma/README-engines.md — Modules
-- 16, 17, and 18 hit the identical wall). Every column/type/constraint
-- below was cross-checked field-by-field against prisma/schema.prisma's
-- own Module 19 section.
--
-- Run `npx prisma migrate resolve --applied 20260918000000_add_payment_status_tracking`
-- after applying this by hand (e.g. via `psql`), or just run
-- `npx prisma migrate deploy` directly once you have normal network
-- access — either way, always run `npx prisma generate` afterwards so
-- the TypeScript client actually exposes `prisma.paymentObligation` /
-- `prisma.paymentRecord`.

CREATE TYPE "PaymentObligationStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERPAID', 'OVERDUE', 'CANCELLED', 'DISPUTED');

CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'UPI', 'NEFT', 'RTGS', 'IMPS', 'CASH', 'CHEQUE', 'OTHER');

CREATE TYPE "PaymentRecordStatus" AS ENUM ('RECORDED', 'CONFIRMED', 'REVERSED');

-- ---------------------------------------------------------------------
-- PaymentObligation
-- ---------------------------------------------------------------------

CREATE TABLE "payment_obligations" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "tradeOfferId" TEXT,
    "buyerId" TEXT NOT NULL,
    "sellerFarmerId" TEXT,
    "sellerFpoId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "grossAmount" DECIMAL(16,2) NOT NULL,
    "adjustments" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "finalPayableAmount" DECIMAL(16,2) NOT NULL,
    "amountPaid" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(16,2) NOT NULL,
    "status" "PaymentObligationStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_obligations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_obligations_publicId_key" ON "payment_obligations"("publicId");
CREATE UNIQUE INDEX "payment_obligations_deliveryId_key" ON "payment_obligations"("deliveryId");
CREATE INDEX "payment_obligations_buyerId_status_idx" ON "payment_obligations"("buyerId", "status");
CREATE INDEX "payment_obligations_sellerFarmerId_status_idx" ON "payment_obligations"("sellerFarmerId", "status");
CREATE INDEX "payment_obligations_sellerFpoId_status_idx" ON "payment_obligations"("sellerFpoId", "status");
CREATE INDEX "payment_obligations_status_idx" ON "payment_obligations"("status");
CREATE INDEX "payment_obligations_dueAt_idx" ON "payment_obligations"("dueAt");
CREATE INDEX "payment_obligations_createdAt_idx" ON "payment_obligations"("createdAt");

ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "trade_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_sellerFarmerId_fkey" FOREIGN KEY ("sellerFarmerId") REFERENCES "farmer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_obligations" ADD CONSTRAINT "payment_obligations_sellerFpoId_fkey" FOREIGN KEY ("sellerFpoId") REFERENCES "fpos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- PaymentRecord
-- ---------------------------------------------------------------------

CREATE TABLE "payment_records" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "paymentObligationId" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "externalReference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'RECORDED',
    "recordedByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_records_publicId_key" ON "payment_records"("publicId");
CREATE UNIQUE INDEX "payment_records_paymentObligationId_idempotencyKey_key" ON "payment_records"("paymentObligationId", "idempotencyKey");
CREATE INDEX "payment_records_paymentObligationId_createdAt_idx" ON "payment_records"("paymentObligationId", "createdAt");
CREATE INDEX "payment_records_status_idx" ON "payment_records"("status");

ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_paymentObligationId_fkey" FOREIGN KEY ("paymentObligationId") REFERENCES "payment_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
