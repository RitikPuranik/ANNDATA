import { LedgerDirection, LedgerEventType, LedgerSourceModule } from "@prisma/client";

/**
 * Module 20 — Digital Transaction Ledger. Raw Prisma row shape and the
 * public DTO mapped from it, same convention as Module 19's own
 * payment.types.ts. publicId is the only identity ever exposed over the
 * API — internal database ids (tradeId/lotId/farmerId/buyerId/
 * sourceEntityId/createdByUserId/reversalOfEntryId) never leak into a
 * response as-is; they are resolved to public ids by the service before
 * building a DTO.
 */

export interface LedgerEntryRow {
  id: string;
  publicId: string;
  transactionId: string;
  tradeId: string | null;
  lotId: string | null;
  farmerId: string | null;
  buyerId: string | null;
  eventType: LedgerEventType;
  direction: LedgerDirection;
  amount: unknown; // Prisma.Decimal at runtime
  currency: string;
  sourceModule: LedgerSourceModule;
  sourceEntityId: string | null;
  sourceEventId: string | null;
  description: string | null;
  metadata: unknown;
  reversalOfEntryId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number((value as { toString(): string }).toString());
}

export { toNumber as decimalToNumber };

export interface LedgerEntryDTO {
  publicId: string;
  transactionId: string;
  tradeId: string | null;
  lotId: string | null;
  farmerId: string | null;
  buyerId: string | null;
  eventType: LedgerEventType;
  direction: LedgerDirection;
  amount: number;
  currency: string;
  sourceModule: LedgerSourceModule;
  sourceEntityId: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  reversalOfEntryId: string | null;
  createdAt: string;
}

export type LedgerObligationStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "REFUNDED" | "DISPUTED";

/**
 * "Financial Status" — derived read-only from Module 19's own
 * PaymentObligationStatus, never a second state machine (Step: "Financial
 * Status" — "Do not create a new payment-state machine that conflicts
 * with Module 19"). See mapObligationStatusToLedgerStatus() below.
 */
export interface TransactionSummaryDTO {
  transactionId: string;
  currency: string;
  /** Authoritative source: Module 19 PaymentObligation.finalPayableAmount. */
  grossValue: number | null;
  /** Authoritative source: sum of active ledger deduction entries
   * (LOGISTICS_COST_RECORDED/STORAGE_COST_RECORDED/OTHER_DEDUCTION_RECORDED),
   * or null when none were ever recorded. */
  deductions: number | null;
  /** Authoritative source: Module 14 NetRealizationCalculation snapshot
   * captured on the NET_REALIZATION_RECORDED entry, when one exists. */
  netRealization: number | null;
  /** Authoritative source: Module 19 PaymentObligation.amountPaid. */
  amountPaid: number;
  /** Authoritative source: Module 19 PaymentObligation.amountDue. */
  amountOutstanding: number | null;
  status: LedgerObligationStatus | null;
  entries: LedgerEntryDTO[];
}
