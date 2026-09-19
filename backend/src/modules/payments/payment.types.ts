import { PaymentMethod, PaymentObligationStatus, PaymentRecordStatus } from "@prisma/client";

/**
 * Module 19 — Payment Status Tracking. Raw Prisma row shapes and the
 * public DTOs mapped from them, same convention as Module 18's own
 * delivery.types.ts. publicId is the only identity ever exposed over the
 * API — internal database ids (deliveryId, tradeOfferId, buyerId,
 * sellerFarmerId, sellerFpoId, paymentObligationId, recordedByUserId)
 * never leak into a response as-is.
 */

export interface PaymentObligationRecord {
  id: string;
  publicId: string;
  deliveryId: string;
  tradeOfferId: string | null;
  buyerId: string;
  sellerFarmerId: string | null;
  sellerFpoId: string | null;
  currency: string;
  grossAmount: unknown; // Prisma.Decimal at runtime
  adjustments: unknown;
  finalPayableAmount: unknown;
  amountPaid: unknown;
  amountDue: unknown;
  status: PaymentObligationStatus;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRecordRow {
  id: string;
  publicId: string;
  paymentObligationId: string;
  amount: unknown;
  currency: string;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  externalReference: string | null;
  paidAt: Date;
  status: PaymentRecordStatus;
  recordedByUserId: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number((value as { toString(): string }).toString());
}

function toNullableNumber(value: unknown | null): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

export { toNumber as decimalToNumber, toNullableNumber as nullableDecimalToNumber };

// ---------------------------------------------------------------------
// Public DTOs
// ---------------------------------------------------------------------

export interface PaymentRecordDTO {
  publicId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  externalReference: string | null;
  paidAt: string;
  status: PaymentRecordStatus;
  notes: string | null;
  createdAt: string;
}

export interface PaymentObligationDTO {
  publicId: string;
  deliveryId: string;
  tradeOfferId: string | null;
  buyerId: string;
  sellerFarmerId: string | null;
  sellerFpoId: string | null;
  currency: string;
  grossAmount: number;
  adjustments: number;
  finalPayableAmount: number;
  amountPaid: number;
  amountDue: number;
  /** Step 11 — exposed only once amountPaid exceeds finalPayableAmount;
   * null otherwise (never negative). */
  excessAmount: number | null;
  status: PaymentObligationStatus;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  payments?: PaymentRecordDTO[];
}

/** Step 28 — the entire Module 20 (Digital Transaction Ledger) handoff
 * contract. Module 19 never implements ledger functionality itself. */
export interface PaymentHandoffDTO {
  paymentObligationId: string;
  paymentRecordId: string;
  deliveryId: string;
  buyerId: string;
  sellerFarmerId: string | null;
  sellerFpoId: string | null;
  payableAmount: number;
  paymentAmount: number;
  currency: string;
  paymentTimestamp: string;
  paymentStatus: PaymentObligationStatus;
  externalReference: string | null;
}
