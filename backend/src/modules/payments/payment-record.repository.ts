import { PaymentMethod, PaymentRecordStatus, Prisma, PrismaClient } from "@prisma/client";
import { PaymentRecordRow, decimalToNumber } from "./payment.types";

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

export { isUniqueConstraintError };

export interface CreatePaymentRecordData {
  paymentObligationId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  externalReference: string | null;
  paidAt: Date;
  recordedByUserId: string;
  notes: string | null;
}

export interface PaymentRecordListFilters {
  paymentObligationId: string;
  page: number;
  limit: number;
}

export interface PaymentRecordPage {
  items: PaymentRecordRow[];
  total: number;
}

export interface PaymentRecordRepository {
  /** Step 21 — append-only create inside the caller's transaction (never
   * outside one, so it always shares the obligation row lock — see
   * payment.service.ts's recordPayment()). */
  createInTransaction(tx: Prisma.TransactionClient, data: CreatePaymentRecordData): Promise<PaymentRecordRow>;
  findByIdempotencyKeyInTransaction(tx: Prisma.TransactionClient, paymentObligationId: string, idempotencyKey: string): Promise<PaymentRecordRow | null>;
  /** Step 23 — every non-REVERSED amount recorded for this obligation, as
   * plain rupee numbers (see payment-status.calculator.ts's own boundary
   * comment for why the Decimal->number conversion happens here rather
   * than being deferred), used by recalculateObligationState(); always
   * read inside the same transaction as the write that triggered the
   * recalculation. */
  listActiveAmountsInTransaction(tx: Prisma.TransactionClient, paymentObligationId: string): Promise<number[]>;
  findByPublicId(publicId: string): Promise<PaymentRecordRow | null>;
  findById(id: string): Promise<PaymentRecordRow | null>;
  list(filters: PaymentRecordListFilters): Promise<PaymentRecordPage>;
  /** Step 23 — reversal is a new row, never an in-place edit. Marks the
   * original REVERSED and returns it; the caller records a fresh
   * replacement PaymentRecord separately if one is needed. */
  markReversed(id: string): Promise<PaymentRecordRow>;
}

export class PrismaPaymentRecordRepository implements PaymentRecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  createInTransaction(tx: Prisma.TransactionClient, data: CreatePaymentRecordData) {
    return tx.paymentRecord.create({
      data: {
        paymentObligationId: data.paymentObligationId,
        amount: data.amount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        idempotencyKey: data.idempotencyKey,
        externalReference: data.externalReference,
        paidAt: data.paidAt,
        recordedByUserId: data.recordedByUserId,
        notes: data.notes,
        status: "RECORDED",
      },
    });
  }

  findByIdempotencyKeyInTransaction(tx: Prisma.TransactionClient, paymentObligationId: string, idempotencyKey: string) {
    return tx.paymentRecord.findUnique({ where: { paymentObligationId_idempotencyKey: { paymentObligationId, idempotencyKey } } });
  }

  async listActiveAmountsInTransaction(tx: Prisma.TransactionClient, paymentObligationId: string): Promise<number[]> {
    const rows = await tx.paymentRecord.findMany({
      where: { paymentObligationId, status: { not: "REVERSED" as PaymentRecordStatus } },
      select: { amount: true },
    });
    return rows.map((r: { amount: unknown }) => decimalToNumber(r.amount));
  }

  findByPublicId(publicId: string) {
    return this.prisma.paymentRecord.findUnique({ where: { publicId } });
  }

  findById(id: string) {
    return this.prisma.paymentRecord.findUnique({ where: { id } });
  }

  async list(filters: PaymentRecordListFilters): Promise<PaymentRecordPage> {
    const where = { paymentObligationId: filters.paymentObligationId };
    const [items, total] = await Promise.all([
      this.prisma.paymentRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.paymentRecord.count({ where }),
    ]);
    return { items, total };
  }

  markReversed(id: string) {
    return this.prisma.paymentRecord.update({ where: { id }, data: { status: "REVERSED" } });
  }
}
