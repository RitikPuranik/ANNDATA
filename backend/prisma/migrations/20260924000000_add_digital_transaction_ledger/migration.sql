-- Module 20 — Digital Transaction Ledger.
--
-- Purely additive: three new enums and one new table. No existing table,
-- column, index, or enum value is altered or dropped. tradeId/lotId/
-- farmerId/buyerId/sourceEntityId are plain indexed TEXT columns with no
-- foreign key constraint (see the schema's own module-level comment for
-- why) — so this migration touches nothing outside the new table.
--
-- Hand-authored for the same reason as the Module 16/17/18/19 migrations
-- before it: this build sandbox cannot reach binaries.prisma.sh to run
-- `prisma migrate dev` itself. Every column/type/constraint below was
-- cross-checked field-by-field against prisma/schema.prisma's own
-- Module 20 section.
--
-- Run `npx prisma migrate resolve --applied 20260924000000_add_digital_transaction_ledger`
-- after applying this by hand (e.g. via `psql`), or just run
-- `npx prisma migrate deploy` directly once you have normal network
-- access — either way, always run `npx prisma generate` afterwards so
-- the TypeScript client actually exposes `prisma.digitalTransactionLedger`.

CREATE TYPE "LedgerEventType" AS ENUM (
    'TRADE_VALUE_RECORDED',
    'NET_REALIZATION_RECORDED',
    'LOGISTICS_COST_RECORDED',
    'STORAGE_COST_RECORDED',
    'OTHER_DEDUCTION_RECORDED',
    'DELIVERY_ADJUSTMENT',
    'PAYMENT_OBLIGATION_CREATED',
    'PAYMENT_RECORDED',
    'PARTIAL_PAYMENT',
    'FINAL_PAYMENT',
    'REFUND',
    'REVERSAL',
    'MANUAL_ADJUSTMENT'
);

CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

CREATE TYPE "LedgerSourceModule" AS ENUM (
    'MODULE_13_TRADE',
    'MODULE_14_NET_REALIZATION',
    'MODULE_18_RECONCILIATION',
    'MODULE_19_PAYMENT',
    'MANUAL_ADJUSTMENT',
    'REVERSAL'
);

-- ---------------------------------------------------------------------
-- DigitalTransactionLedger
-- ---------------------------------------------------------------------

CREATE TABLE "digital_transaction_ledger" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,

    "transactionId" TEXT NOT NULL,

    "tradeId" TEXT,
    "lotId" TEXT,
    "farmerId" TEXT,
    "buyerId" TEXT,

    "eventType" "LedgerEventType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,

    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',

    "sourceModule" "LedgerSourceModule" NOT NULL,
    "sourceEntityId" TEXT,
    "sourceEventId" TEXT,

    "description" TEXT,
    "metadata" JSONB,

    "reversalOfEntryId" TEXT,

    "createdByUserId" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_transaction_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "digital_transaction_ledger_publicId_key" ON "digital_transaction_ledger"("publicId");

-- Idempotency: a payment webhook/retry/replay can never create a second
-- ledger row for the same upstream event. NULLs in sourceEntityId/
-- sourceEventId are treated as distinct by Postgres, so the application
-- layer (see digital-transaction-ledger.service.ts) always supplies both
-- for every event type except MANUAL_ADJUSTMENT, which is never subject
-- to replay in the first place.
CREATE UNIQUE INDEX "ledger_idempotency_key" ON "digital_transaction_ledger"("sourceModule", "sourceEntityId", "sourceEventId", "eventType");

CREATE INDEX "digital_transaction_ledger_transactionId_createdAt_idx" ON "digital_transaction_ledger"("transactionId", "createdAt");
CREATE INDEX "digital_transaction_ledger_tradeId_idx" ON "digital_transaction_ledger"("tradeId");
CREATE INDEX "digital_transaction_ledger_farmerId_idx" ON "digital_transaction_ledger"("farmerId");
CREATE INDEX "digital_transaction_ledger_buyerId_idx" ON "digital_transaction_ledger"("buyerId");
CREATE INDEX "digital_transaction_ledger_sourceModule_sourceEntityId_idx" ON "digital_transaction_ledger"("sourceModule", "sourceEntityId");
CREATE INDEX "digital_transaction_ledger_createdAt_idx" ON "digital_transaction_ledger"("createdAt");

-- Self-referencing FK for reversalOfEntryId. onDelete: Restrict (matches
-- the Prisma schema) — a reversed entry, and the reversal itself, can
-- never be deleted while the other still exists; ledger rows are never
-- deleted at all through the application, but this guards the column
-- against being dropped out from under a reversal chain at the DB level.
ALTER TABLE "digital_transaction_ledger"
    ADD CONSTRAINT "digital_transaction_ledger_reversalOfEntryId_fkey"
    FOREIGN KEY ("reversalOfEntryId") REFERENCES "digital_transaction_ledger"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
