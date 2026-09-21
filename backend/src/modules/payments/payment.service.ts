import { PaymentMethod, PaymentObligationStatus, Prisma, PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  PaymentDomainError,
} from "../../common/errors";
import { AuthenticatedUserContext, RequestMeta } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { convertQuantityToKg } from "../fpo/unit-conversion";
import { DeliveryRepository } from "../deliveries/delivery.repository";
import { DeliveryService } from "../deliveries/delivery.service";
import { FarmerProfileResolver } from "../farmers/farmer-profile.resolver";
import {
  CreatePaymentObligationData,
  PaymentObligationListFilters,
  PaymentObligationRepository,
} from "./payment-obligation.repository";
import { PaymentRecordListFilters, PaymentRecordRepository } from "./payment-record.repository";
import { PaymentAuthorizationService } from "./payment.authorization";
import { calculateGrossAmount, calculatePayableAmount, recalculateObligationState } from "./payment-status.calculator";
import { canTransitionObligation, isObligationOverdue } from "./payment-state-machine";
import {
  PaymentHandoffDTO,
  PaymentObligationDTO,
  PaymentObligationRecord,
  PaymentRecordDTO,
  PaymentRecordRow,
  decimalToNumber,
} from "./payment.types";

export interface CreatePaymentObligationInput {
  deliveryId: string;
  /** Step 17 — honored only when the caller is ADMIN (see
   * createObligation()'s own comment); ignored otherwise rather than
   * rejected, since a non-admin simply gets the honest default (no due
   * date) instead of an error for a field they have no authority over. */
  dueAt?: Date;
}

export interface RecordPaymentInput {
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  externalReference?: string;
  paidAt: Date;
  notes?: string;
}

/**
 * Module 19 — Payment Status Tracking. A PAYMENT STATUS system, never a
 * payment gateway (Step 36): no bank transfer, UPI, or card execution is
 * ever performed by this service. Consumes Module 18's own
 * DeliveryService.getHandoff() (never re-implements delivery/quality
 * reconciliation) to resolve the authoritative accepted quantity and
 * party identities, and this module's own resolution of the accepted
 * TradeOffer's price to compute finalPayableAmount server-side (Step 2/8:
 * the client never supplies or overrides this figure).
 *
 * Lifecycle:
 *   Module 18 Delivery (RECONCILED)
 *     -> createObligation()          PENDING
 *     -> recordPayment() (1..n)      PARTIALLY_PAID / PAID / OVERPAID
 *     -> [derived] OVERDUE            (dueAt passed, amountDue > 0)
 *     -> markDisputed() / cancel()   DISPUTED / CANCELLED
 *   -> getRecordHandoff()            Module 20 Digital Transaction Ledger
 */
export class PaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly obligations: PaymentObligationRepository,
    private readonly records: PaymentRecordRepository,
    private readonly deliveries: DeliveryRepository,
    private readonly deliveryService: DeliveryService,
    private readonly authorization: PaymentAuthorizationService,
    private readonly farmerProfiles: FarmerProfileResolver,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // Step 11/12 — obligation creation
  // ---------------------------------------------------------------------

  async createObligation(
    user: AuthenticatedUserContext,
    input: CreatePaymentObligationInput,
    meta?: RequestMeta,
  ): Promise<PaymentObligationDTO> {
    const delivery = await this.deliveries.findByPublicId(input.deliveryId);
    if (!delivery) throw new NotFoundError("Delivery not found.");

    // Step 7 — only a finalized/valid reconciliation may create the
    // authoritative payment obligation.
    if (delivery.status !== "RECONCILED") {
      throw new PaymentDomainError(
        "Payment obligations may only be created from a delivery that has been fully reconciled (Module 18).",
        "DELIVERY_NOT_RECONCILED",
      );
    }

    const existing = await this.obligations.findByDeliveryId(delivery.id);
    if (existing) {
      throw new ConflictError("A payment obligation already exists for this delivery.");
    }

    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    if (user.role !== "ADMIN" && !(user.role === "BUYER" && callerBuyerProfileId === delivery.buyerId)) {
      throw new AuthorizationError("Only the buyer of this delivery may create its payment obligation.");
    }

    // Step 26 — consume Module 18's own handoff rather than re-deriving
    // quantity/quality/reconciliation facts.
    const handoff = await this.deliveryService.getHandoff(user, input.deliveryId);
    if (handoff.acceptedQuantity === null || handoff.acceptedQuantity <= 0) {
      throw new PaymentDomainError(
        "This delivery has no accepted quantity to base a payment obligation on.",
        "DELIVERY_NOT_RECONCILED",
      );
    }
    if (!delivery.tradeOfferId) {
      throw new PaymentDomainError(
        "This delivery has no accepted trade offer to resolve a price from.",
        "DELIVERY_NOT_RECONCILED",
      );
    }

    const tradeOffer = await this.prisma.tradeOffer.findUnique({ where: { id: delivery.tradeOfferId } });
    if (!tradeOffer) throw new NotFoundError("The delivery's accepted trade offer could not be resolved.");

    // Step 8 — finalPayableAmount = acceptedQuantity x agreedUnitPrice +
    // adjustments, calculated server-side from authoritative data only.
    const priceQuantityUnit = resolvePriceQuantityUnit(tradeOffer.priceUnit);
    const quantityUnitDivisorKg = convertQuantityToKg(1, priceQuantityUnit);
    const grossAmount = calculateGrossAmount(decimalToNumber(tradeOffer.offeredPrice), handoff.acceptedQuantity, quantityUnitDivisorKg);
    // Step 8 — "ONLY implement adjustments already represented by
    // existing ANNDATA business rules": no quality-shortfall/logistics
    // deduction rule is implemented anywhere else in this codebase today,
    // so adjustments is always 0 in this version (see the module's own
    // limitations note in the final report) rather than an invented
    // deduction.
    const adjustments = 0;
    const finalPayableAmount = calculatePayableAmount(grossAmount, adjustments);

    const dueAt = user.role === "ADMIN" ? input.dueAt ?? null : null;

    const createData: CreatePaymentObligationData = {
      deliveryId: delivery.id,
      tradeOfferId: delivery.tradeOfferId,
      buyerId: handoff.buyerId,
      sellerFarmerId: handoff.sellerFarmerId,
      sellerFpoId: handoff.sellerFpoId,
      currency: "INR",
      grossAmount,
      adjustments,
      finalPayableAmount,
      amountDue: finalPayableAmount,
      dueAt,
    };

    let obligation: PaymentObligationRecord;
    try {
      obligation = await this.obligations.create(createData);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictError("A payment obligation already exists for this delivery.");
      }
      throw err;
    }

    await this.audit.record({
      actorUserId: user.id,
      action: "PAYMENT_OBLIGATION_CREATED",
      entityType: "PaymentObligation",
      entityId: obligation.id,
      metadata: { deliveryId: delivery.publicId, finalPayableAmount: finalPayableAmount.toString() },
      ...meta,
    });

    return this.buildDTO(obligation);
  }

  // ---------------------------------------------------------------------
  // Step 13/21/22 — record a payment
  // ---------------------------------------------------------------------

  async recordPayment(
    user: AuthenticatedUserContext,
    publicId: string,
    input: RecordPaymentInput,
    meta?: RequestMeta,
  ): Promise<PaymentObligationDTO> {
    const obligation = await this.loadOrThrow(publicId);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    this.authorization.assertCanRecordPayment(user, obligation, callerBuyerProfileId);

    if (obligation.status === "CANCELLED") {
      throw new PaymentDomainError("This payment obligation has been cancelled and can no longer accept payments.", "PAYMENT_OBLIGATION_CANCELLED");
    }
    if (input.currency !== obligation.currency) {
      throw new PaymentDomainError("Payment currency does not match the obligation's currency.", "PAYMENT_CURRENCY_MISMATCH");
    }
    if (input.amount <= 0) {
      throw new PaymentDomainError("Payment amount must be greater than zero.", "INVALID_PAYMENT_AMOUNT");
    }

    type TxResult = {
      record: PaymentRecordRow;
      obligation: PaymentObligationRecord;
      deduped: boolean;
      previousStatus?: PaymentObligationStatus;
    };

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<TxResult> => {
      // Step 22 — lock the obligation row first: two concurrent
      // recordPayment calls against the same obligation must serialize,
      // never race on amountPaid/amountDue.
      const locked = await this.obligations.lockForUpdate(tx, obligation.id);
      if (!locked) throw new NotFoundError("Payment obligation not found.");

      // Step 21 — idempotency: a repeated request with the same key for
      // this obligation is a no-op, never a duplicate PaymentRecord.
      const existingRecord = await this.records.findByIdempotencyKeyInTransaction(tx, obligation.id, input.idempotencyKey);
      if (existingRecord) {
        const current = await this.obligations.findByIdInTransaction(tx, obligation.id);
        if (!current) throw new NotFoundError("Payment obligation not found.");
        return { record: existingRecord, obligation: current, deduped: true };
      }

      const current = await this.obligations.findByIdInTransaction(tx, obligation.id);
      if (!current) throw new NotFoundError("Payment obligation not found.");
      if (current.status === "CANCELLED") {
        throw new PaymentDomainError("This payment obligation has been cancelled and can no longer accept payments.", "PAYMENT_OBLIGATION_CANCELLED");
      }
      if (current.status === "DISPUTED") {
        throw new PaymentDomainError("This payment obligation is under dispute; resolve the dispute before recording further payments.", "PAYMENT_OBLIGATION_NOT_MUTABLE");
      }

      const record = await this.records.createInTransaction(tx, {
        paymentObligationId: obligation.id,
        amount: input.amount,
        currency: input.currency,
        paymentMethod: input.paymentMethod,
        idempotencyKey: input.idempotencyKey,
        externalReference: input.externalReference ?? null,
        paidAt: input.paidAt,
        recordedByUserId: user.id,
        notes: input.notes ?? null,
      });

      const activeAmounts = await this.records.listActiveAmountsInTransaction(tx, obligation.id);
      const state = recalculateObligationState(
        decimalToNumber(current.finalPayableAmount),
        activeAmounts,
        current.status as PaymentObligationStatus,
      );
      const updated = await this.obligations.updateAmountsAndStatus(tx, obligation.id, {
        amountPaid: state.amountPaid,
        amountDue: state.amountDue,
        status: state.status,
      });

      return { record, obligation: updated, deduped: false, previousStatus: current.status };
    });

    if (!result.deduped) {
      await this.audit.record({
        actorUserId: user.id,
        action: "PAYMENT_RECORDED",
        entityType: "PaymentRecord",
        entityId: result.record.id,
        metadata: { amount: input.amount, paymentMethod: input.paymentMethod, obligationId: obligation.publicId },
        ...meta,
      });
      const newStatus = result.obligation.status;
      if (newStatus === "PARTIALLY_PAID" && result.previousStatus !== "PARTIALLY_PAID") {
        await this.audit.record({ actorUserId: user.id, action: "PAYMENT_PARTIALLY_PAID", entityType: "PaymentObligation", entityId: obligation.id, ...meta });
      } else if (newStatus === "PAID") {
        await this.audit.record({ actorUserId: user.id, action: "PAYMENT_COMPLETED", entityType: "PaymentObligation", entityId: obligation.id, ...meta });
      } else if (newStatus === "OVERPAID") {
        await this.audit.record({ actorUserId: user.id, action: "PAYMENT_OVERPAID", entityType: "PaymentObligation", entityId: obligation.id, ...meta });
      }
    }

    return this.buildDTO(result.obligation);
  }

  // ---------------------------------------------------------------------
  // Step 15 — confirmation
  // ---------------------------------------------------------------------

  async confirmPayment(user: AuthenticatedUserContext, recordPublicId: string, meta?: RequestMeta): Promise<PaymentRecordDTO> {
    const record = await this.records.findByPublicId(recordPublicId);
    if (!record) throw new NotFoundError("Payment record not found.");
    const obligation = await this.obligations.findById(record.paymentObligationId);
    if (!obligation) throw new NotFoundError("Payment obligation not found.");

    const callerFarmerProfileId = await this.resolveCallerFarmerProfileId(user);
    await this.authorization.assertCanConfirmPayment(user, obligation, callerFarmerProfileId);

    if (record.status !== "RECORDED") {
      throw new PaymentDomainError("Only a RECORDED payment may be confirmed.", "INVALID_PAYMENT_TRANSITION");
    }

    const updated = await this.prisma.paymentRecord.update({ where: { id: record.id }, data: { status: "CONFIRMED" } });

    await this.audit.record({
      actorUserId: user.id,
      action: "PAYMENT_CONFIRMED",
      entityType: "PaymentRecord",
      entityId: record.id,
      metadata: { obligationId: obligation.publicId },
      ...meta,
    });

    return this.buildRecordDTO(updated);
  }

  // ---------------------------------------------------------------------
  // Step 14/19 — dispute and cancellation
  // ---------------------------------------------------------------------

  async markDisputed(user: AuthenticatedUserContext, publicId: string, reason: string, meta?: RequestMeta): Promise<PaymentObligationDTO> {
    const obligation = await this.loadOrThrow(publicId);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    const callerFarmerProfileId = await this.resolveCallerFarmerProfileId(user);
    await this.authorization.assertCanMarkDisputed(user, obligation, callerFarmerProfileId, callerBuyerProfileId);

    if (!canTransitionObligation(obligation.status as PaymentObligationStatus, "DISPUTED")) {
      throw new PaymentDomainError(`A ${obligation.status} obligation cannot be disputed.`, "INVALID_PAYMENT_TRANSITION");
    }

    const updated = await this.obligations.transition(obligation.id, [obligation.status], "DISPUTED");
    if (!updated) {
      throw new ConflictError("This obligation was already updated by a concurrent request.");
    }

    await this.audit.record({
      actorUserId: user.id,
      action: "PAYMENT_DISPUTED",
      entityType: "PaymentObligation",
      entityId: obligation.id,
      metadata: { reason },
      ...meta,
    });

    return this.buildDTO(updated);
  }

  async cancelObligation(user: AuthenticatedUserContext, publicId: string, reason: string, meta?: RequestMeta): Promise<PaymentObligationDTO> {
    const obligation = await this.loadOrThrow(publicId);
    this.authorization.assertAdminOnly(user);

    if (!canTransitionObligation(obligation.status as PaymentObligationStatus, "CANCELLED")) {
      throw new PaymentDomainError(`A ${obligation.status} obligation cannot be cancelled.`, "INVALID_PAYMENT_TRANSITION");
    }

    const updated = await this.obligations.transition(obligation.id, [obligation.status], "CANCELLED");
    if (!updated) {
      throw new ConflictError("This obligation was already updated by a concurrent request.");
    }

    await this.audit.record({
      actorUserId: user.id,
      action: "PAYMENT_CANCELLED",
      entityType: "PaymentObligation",
      entityId: obligation.id,
      metadata: { reason },
      ...meta,
    });

    return this.buildDTO(updated);
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async get(user: AuthenticatedUserContext, publicId: string): Promise<PaymentObligationDTO> {
    const obligation = await this.loadOrThrow(publicId);
    await this.assertCanView(user, obligation);
    const maybeOverdue = await this.applyDerivedOverdueIfNeeded(obligation);
    const page = await this.records.list({ paymentObligationId: maybeOverdue.id, page: 1, limit: 100 });
    return this.buildDTO(maybeOverdue, page.items);
  }

  async list(
    user: AuthenticatedUserContext,
    filters: Omit<PaymentObligationListFilters, "visibleBuyerIds" | "visibleSellerFarmerIds" | "visibleSellerFpoIds">,
  ): Promise<{ items: PaymentObligationDTO[]; total: number }> {
    const scoped: PaymentObligationListFilters = { ...filters };

    if (user.role === "BUYER") {
      const buyerProfileId = await this.resolveCallerBuyerProfileId(user);
      if (!buyerProfileId) return { items: [], total: 0 };
      scoped.buyerId = buyerProfileId;
    } else if (user.role === "FARMER") {
      const farmer = await this.farmerProfiles.ensure(user.id);
      scoped.sellerFarmerId = farmer.id;
    } else if (user.role === "FPO_ADMIN") {
      const managedFpoIds = await this.resolveCallerManagedFpoIds(user);
      if (managedFpoIds.length === 0) return { items: [], total: 0 };
      scoped.visibleSellerFpoIds = managedFpoIds;
    }
    // ADMIN — no additional scoping.

    const page = await this.obligations.list(scoped);
    const withDerivedOverdue = await Promise.all(page.items.map((o) => this.applyDerivedOverdueIfNeeded(o)));
    const items = withDerivedOverdue.map((o) => this.buildDTO(o));
    return { items, total: page.total };
  }

  async listPayments(
    user: AuthenticatedUserContext,
    obligationPublicId: string,
    filters: Omit<PaymentRecordListFilters, "paymentObligationId">,
  ): Promise<{ items: PaymentRecordDTO[]; total: number }> {
    const obligation = await this.loadOrThrow(obligationPublicId);
    await this.assertCanView(user, obligation);
    const page = await this.records.list({ ...filters, paymentObligationId: obligation.id });
    return { items: page.items.map((r) => this.buildRecordDTO(r)), total: page.total };
  }

  // ---------------------------------------------------------------------
  // Step 28 — Module 20 handoff
  // ---------------------------------------------------------------------

  async getRecordHandoff(user: AuthenticatedUserContext, recordPublicId: string): Promise<PaymentHandoffDTO> {
    const record = await this.records.findByPublicId(recordPublicId);
    if (!record) throw new NotFoundError("Payment record not found.");
    const obligation = await this.obligations.findById(record.paymentObligationId);
    if (!obligation) throw new NotFoundError("Payment obligation not found.");
    await this.assertCanView(user, obligation);

    const delivery = await this.deliveries.findById(obligation.deliveryId);
    if (!delivery) throw new NotFoundError("The obligation's delivery could not be resolved.");

    return {
      // Step 28 — internal ids, exposed as-is for Module 20 to reuse
      // directly as its own foreign keys, same convention Module 18's own
      // DeliveryHandoffDTO uses for buyerId/sellerFarmerId/sellerFpoId.
      paymentObligationId: obligation.id,
      paymentRecordId: record.id,
      deliveryId: delivery.publicId,
      buyerId: obligation.buyerId,
      sellerFarmerId: obligation.sellerFarmerId,
      sellerFpoId: obligation.sellerFpoId,
      payableAmount: decimalToNumber(obligation.finalPayableAmount),
      paymentAmount: decimalToNumber(record.amount),
      currency: obligation.currency,
      paymentTimestamp: record.paidAt.toISOString(),
      paymentStatus: obligation.status,
      externalReference: record.externalReference,
    };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async loadOrThrow(publicId: string): Promise<PaymentObligationRecord> {
    const obligation = await this.obligations.findByPublicId(publicId);
    if (!obligation) throw new NotFoundError("Payment obligation not found.");
    return obligation;
  }

  private async assertCanView(user: AuthenticatedUserContext, obligation: PaymentObligationRecord): Promise<void> {
    const callerFarmerProfileId = await this.resolveCallerFarmerProfileId(user);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    const allowed = await this.authorization.canView(user, obligation, callerFarmerProfileId, callerBuyerProfileId);
    if (!allowed) throw new AuthorizationError("You do not have permission to view this payment obligation.");
  }

  /** Step 18 — lazily advances PENDING/PARTIALLY_PAID into OVERDUE on
   * read, same "advance on access" convention as Module 18's own
   * moveToUnderInspectionIfNeeded(); no separate scheduler/cron
   * infrastructure is introduced for this (Step 18's own fallback: "if
   * the existing scheduler architecture is unsuitable, implement overdue
   * status as a derived state in queries/services instead"). */
  private async applyDerivedOverdueIfNeeded(obligation: PaymentObligationRecord): Promise<PaymentObligationRecord> {
    const amountDue = decimalToNumber(obligation.amountDue);
    const overdue = isObligationOverdue(obligation.status as PaymentObligationStatus, obligation.dueAt, amountDue, new Date());
    if (!overdue) return obligation;
    const advanced = await this.obligations.transition(obligation.id, [obligation.status as PaymentObligationStatus], "OVERDUE");
    if (advanced) {
      await this.audit.record({ action: "PAYMENT_MARKED_OVERDUE", entityType: "PaymentObligation", entityId: obligation.id });
      return advanced;
    }
    return obligation;
  }

  private async resolveCallerBuyerProfileId(user: AuthenticatedUserContext): Promise<string | null> {
    if (user.role !== "BUYER") return null;
    const buyer = await this.prisma.buyerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return buyer?.id ?? null;
  }

  private async resolveCallerFarmerProfileId(user: AuthenticatedUserContext): Promise<string | null> {
    if (user.role !== "FARMER") return null;
    const farmer = await this.prisma.farmerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return farmer?.id ?? null;
  }

  private async resolveCallerManagedFpoIds(user: AuthenticatedUserContext): Promise<string[]> {
    if (user.role !== "FPO_ADMIN") return [];
    const rows = await this.prisma.fpoAdmin.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { fpoId: true } });
    return rows.map((r: { fpoId: string }) => r.fpoId);
  }

  private buildDTO(obligation: PaymentObligationRecord, payments?: PaymentRecordRow[]): PaymentObligationDTO {
    const finalPayableAmount = decimalToNumber(obligation.finalPayableAmount);
    const amountPaid = decimalToNumber(obligation.amountPaid);
    const excessAmount = amountPaid > finalPayableAmount ? amountPaid - finalPayableAmount : null;
    return {
      publicId: obligation.publicId,
      deliveryId: obligation.deliveryId,
      tradeOfferId: obligation.tradeOfferId,
      buyerId: obligation.buyerId,
      sellerFarmerId: obligation.sellerFarmerId,
      sellerFpoId: obligation.sellerFpoId,
      currency: obligation.currency,
      grossAmount: decimalToNumber(obligation.grossAmount),
      adjustments: decimalToNumber(obligation.adjustments),
      finalPayableAmount,
      amountPaid,
      amountDue: decimalToNumber(obligation.amountDue),
      excessAmount,
      status: obligation.status,
      dueAt: obligation.dueAt?.toISOString() ?? null,
      createdAt: obligation.createdAt.toISOString(),
      updatedAt: obligation.updatedAt.toISOString(),
      ...(payments ? { payments: payments.map((p) => this.buildRecordDTO(p)) } : {}),
    };
  }

  private buildRecordDTO(record: PaymentRecordRow): PaymentRecordDTO {
    return {
      publicId: record.publicId,
      amount: decimalToNumber(record.amount),
      currency: record.currency,
      paymentMethod: record.paymentMethod,
      externalReference: record.externalReference,
      paidAt: record.paidAt.toISOString(),
      status: record.status,
      notes: record.notes,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

/** Step 9 — this codebase's only price-unit convention seen anywhere
 * (TradeOffer.priceUnit defaults to, and every offer-creation call site
 * uses, "INR_PER_QUINTAL"); parsed defensively rather than assumed, and
 * falls back to QTL (the schema default) for any other "INR_PER_<UNIT>"
 * shape rather than silently mis-pricing on an unrecognized value. */
function resolvePriceQuantityUnit(priceUnit: string): "KG" | "QTL" | "TONNE" {
  const match = /^INR_PER_(KG|QUINTAL|QTL|TONNE)$/i.exec(priceUnit.trim());
  if (!match) return "QTL";
  const token = match[1].toUpperCase();
  if (token === "KG") return "KG";
  if (token === "TONNE") return "TONNE";
  return "QTL"; // QUINTAL or QTL
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}
