import { PaymentObligationStatus, Prisma, PrismaClient } from "@prisma/client";
import { PaymentObligationRecord } from "./payment.types";

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

export { isUniqueConstraintError };

export interface CreatePaymentObligationData {
  deliveryId: string;
  tradeOfferId: string | null;
  buyerId: string;
  sellerFarmerId: string | null;
  sellerFpoId: string | null;
  currency: string;
  grossAmount: number;
  adjustments: number;
  finalPayableAmount: number;
  amountDue: number;
  dueAt: Date | null;
}

export interface PaymentObligationListFilters {
  status?: PaymentObligationStatus;
  buyerId?: string;
  sellerFarmerId?: string;
  sellerFpoId?: string;
  /** Step 30 — resolved server-side to whichever buyer/seller ids the
   * caller's role is entitled to see, same "narrow the same column"
   * convention as DeliveryListFilters.shipmentIds. */
  visibleBuyerIds?: string[];
  visibleSellerFarmerIds?: string[];
  visibleSellerFpoIds?: string[];
  deliveryId?: string;
  tradeOfferId?: string;
  from?: Date;
  to?: Date;
  overdueOnly?: boolean;
  page: number;
  limit: number;
}

export interface PaymentObligationPage {
  items: PaymentObligationRecord[];
  total: number;
}

export interface PaymentObligationRepository {
  create(data: CreatePaymentObligationData): Promise<PaymentObligationRecord>;
  findById(id: string): Promise<PaymentObligationRecord | null>;
  findByPublicId(publicId: string): Promise<PaymentObligationRecord | null>;
  findByDeliveryId(deliveryId: string): Promise<PaymentObligationRecord | null>;
  list(filters: PaymentObligationListFilters): Promise<PaymentObligationPage>;
  /** Step 22 — row-level lock (SELECT ... FOR UPDATE) inside an existing
   * transaction, so two concurrent payment recordings against the same
   * obligation serialize instead of racing on amountPaid/amountDue
   * (Postgres default READ COMMITTED does not otherwise prevent this —
   * see payment.service.ts's recordPayment() for how this is used).
   * Returns whether a row was found and locked; callers must still read
   * the row's typed data via findByIdInTransaction() afterward — the raw
   * query used here returns untyped driver values, never Prisma.Decimal
   * instances, so it is never used as the source of authoritative amounts. */
  lockForUpdate(tx: Prisma.TransactionClient, id: string): Promise<boolean>;
  findByIdInTransaction(tx: Prisma.TransactionClient, id: string): Promise<PaymentObligationRecord | null>;
  updateAmountsAndStatus(
    tx: Prisma.TransactionClient,
    id: string,
    data: { amountPaid: number; amountDue: number; status: PaymentObligationStatus },
  ): Promise<PaymentObligationRecord>;
  /** Step 18 — a bare status transition with no amount change (marking
   * OVERDUE, or an explicit dispute/cancel decision). Conditional
   * updateMany, same "null on 0 rows" pattern as
   * DeliveryRepository.transition(). */
  transition(id: string, fromStatuses: PaymentObligationStatus[], toStatus: PaymentObligationStatus): Promise<PaymentObligationRecord | null>;
}

export class PrismaPaymentObligationRepository implements PaymentObligationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: CreatePaymentObligationData) {
    return this.prisma.paymentObligation.create({
      data: {
        deliveryId: data.deliveryId,
        tradeOfferId: data.tradeOfferId,
        buyerId: data.buyerId,
        sellerFarmerId: data.sellerFarmerId,
        sellerFpoId: data.sellerFpoId,
        currency: data.currency,
        grossAmount: data.grossAmount,
        adjustments: data.adjustments,
        finalPayableAmount: data.finalPayableAmount,
        amountPaid: 0,
        amountDue: data.amountDue,
        dueAt: data.dueAt,
        status: "PENDING",
      },
    });
  }

  findById(id: string) {
    return this.prisma.paymentObligation.findUnique({ where: { id } });
  }

  findByPublicId(publicId: string) {
    return this.prisma.paymentObligation.findUnique({ where: { publicId } });
  }

  findByDeliveryId(deliveryId: string) {
    return this.prisma.paymentObligation.findUnique({ where: { deliveryId } });
  }

  async list(filters: PaymentObligationListFilters): Promise<PaymentObligationPage> {
    const buyerIdFilter = filters.buyerId
      ? filters.visibleBuyerIds
        ? { buyerId: filters.visibleBuyerIds.includes(filters.buyerId) ? filters.buyerId : "__none__" }
        : { buyerId: filters.buyerId }
      : filters.visibleBuyerIds
        ? { buyerId: { in: filters.visibleBuyerIds } }
        : {};
    const sellerFarmerFilter = filters.sellerFarmerId
      ? filters.visibleSellerFarmerIds
        ? { sellerFarmerId: filters.visibleSellerFarmerIds.includes(filters.sellerFarmerId) ? filters.sellerFarmerId : "__none__" }
        : { sellerFarmerId: filters.sellerFarmerId }
      : filters.visibleSellerFarmerIds
        ? { sellerFarmerId: { in: filters.visibleSellerFarmerIds } }
        : {};
    const sellerFpoFilter = filters.sellerFpoId
      ? filters.visibleSellerFpoIds
        ? { sellerFpoId: filters.visibleSellerFpoIds.includes(filters.sellerFpoId) ? filters.sellerFpoId : "__none__" }
        : { sellerFpoId: filters.sellerFpoId }
      : filters.visibleSellerFpoIds
        ? { sellerFpoId: { in: filters.visibleSellerFpoIds } }
        : {};

    const where: Prisma.PaymentObligationWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.deliveryId ? { deliveryId: filters.deliveryId } : {}),
      ...(filters.tradeOfferId ? { tradeOfferId: filters.tradeOfferId } : {}),
      ...buyerIdFilter,
      ...sellerFarmerFilter,
      ...sellerFpoFilter,
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
      ...(filters.overdueOnly
        ? { dueAt: { lt: new Date() }, amountDue: { gt: 0 }, status: { notIn: ["PAID", "OVERPAID", "CANCELLED"] } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.paymentObligation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.paymentObligation.count({ where }),
    ]);
    return { items, total };
  }

  async lockForUpdate(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM payment_obligations WHERE id = ${id} FOR UPDATE
    `;
    return rows.length > 0;
  }

  findByIdInTransaction(tx: Prisma.TransactionClient, id: string) {
    return tx.paymentObligation.findUnique({ where: { id } });
  }

  updateAmountsAndStatus(
    tx: Prisma.TransactionClient,
    id: string,
    data: { amountPaid: number; amountDue: number; status: PaymentObligationStatus },
  ) {
    return tx.paymentObligation.update({
      where: { id },
      data: { amountPaid: data.amountPaid, amountDue: data.amountDue, status: data.status },
    });
  }

  async transition(
    id: string,
    fromStatuses: PaymentObligationStatus[],
    toStatus: PaymentObligationStatus,
  ): Promise<PaymentObligationRecord | null> {
    const result = await this.prisma.paymentObligation.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }
}
