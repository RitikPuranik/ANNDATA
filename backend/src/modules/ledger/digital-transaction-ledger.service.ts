import { LedgerEventType, PaymentObligationStatus, PrismaClient } from "@prisma/client";
import { AuthorizationError, LedgerDomainError, NotFoundError } from "../../common/errors";
import { AuthenticatedUserContext, RequestMeta } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { PaymentHandoffDTO } from "../payments/payment.types";
import {
  CreateLedgerEntryData,
  DigitalTransactionLedgerRepository,
  LedgerListFilters,
} from "./digital-transaction-ledger.repository";
import { LedgerAuthorizationService } from "./digital-transaction-ledger.authorization";
import {
  LedgerEntryDTO,
  LedgerEntryRow,
  LedgerObligationStatus,
  TransactionSummaryDTO,
  decimalToNumber,
} from "./digital-transaction-ledger.types";
import { defaultDirectionFor, isBalanceAffecting, opposite, signedAmount } from "./ledger-direction";

/** Step: Module 19 Integration — the shape PaymentService.getRecordHandoff()
 * already returns, reused as-is (see payment.types.ts's own
 * PaymentHandoffDTO — "the entire Module 20 handoff contract"). */
export type PaymentLedgerHandoff = PaymentHandoffDTO;

export interface RecordNetRealizationSnapshotInput {
  transactionId: string;
  tradeId: string | null;
  lotId: string;
  farmerId: string | null;
  buyerId: string | null;
  currency: string;
  netRealizationCalculationId: string;
  grossRevenue: number | null;
  totalKnownCosts: number | null;
  totalEstimatedCosts: number | null;
  totalUserProvidedCosts: number | null;
  totalDeductions: number | null;
  netRealization: number | null;
}

export interface CreateManualAdjustmentInput {
  transactionId: string;
  tradeId?: string | null;
  lotId?: string | null;
  farmerId?: string | null;
  buyerId?: string | null;
  amount: number;
  currency: string;
  reason: string;
  reference?: string | null;
}

export interface CreateReversalInput {
  reason: string;
}

/**
 * Module 20 — Digital Transaction Ledger service. The only normal
 * application path for creating ledger entries (Step: "Ledger Service").
 * Never a payment gateway: nothing here moves money, initiates a
 * transfer, or fabricates a payment outcome — it only records what
 * Module 13/14/18/19 have already established.
 */
export class DigitalTransactionLedgerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ledger: DigitalTransactionLedgerRepository,
    private readonly authorization: LedgerAuthorizationService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // Module 19 integration — payment events
  // ---------------------------------------------------------------------

  /**
   * Step: "Module 19 Integration". Called by PaymentService after an
   * obligation is created or a payment record is recorded/confirmed.
   * Idempotent: replaying the same paymentRecordId/eventType is a no-op
   * (Step: "Idempotency" — enforced by the DB uniqueness constraint, not
   * just this application-level check).
   */
  async recordPaymentEvent(
    handoff: PaymentLedgerHandoff,
    eventType: Extract<LedgerEventType, "PAYMENT_OBLIGATION_CREATED" | "PAYMENT_RECORDED" | "PARTIAL_PAYMENT" | "FINAL_PAYMENT">,
    actorUserId: string | null,
  ): Promise<LedgerEntryRow> {
    const amount = eventType === "PAYMENT_OBLIGATION_CREATED" ? handoff.payableAmount : handoff.paymentAmount;
    if (amount < 0) {
      throw new LedgerDomainError("Ledger amounts derived from Module 19 can never be negative.", "INVALID_LEDGER_AMOUNT");
    }

    const data: CreateLedgerEntryData = {
      // Step: "Transaction ID" — the Module 18 delivery id is the one
      // durable anchor shared by Module 13/14/18/19 for this sale; never
      // this row's own id.
      transactionId: handoff.deliveryId,
      tradeId: null,
      lotId: null,
      farmerId: handoff.sellerFarmerId,
      buyerId: handoff.buyerId,
      eventType,
      direction: defaultDirectionFor(eventType),
      amount,
      currency: handoff.currency,
      sourceModule: "MODULE_19_PAYMENT",
      sourceEntityId: eventType === "PAYMENT_OBLIGATION_CREATED" ? handoff.paymentObligationId : handoff.paymentRecordId,
      sourceEventId: eventType === "PAYMENT_OBLIGATION_CREATED" ? handoff.paymentObligationId : handoff.paymentRecordId,
      description:
        eventType === "PAYMENT_OBLIGATION_CREATED"
          ? "Payment obligation created from Module 18 delivery reconciliation."
          : "Payment recorded against the obligation (Module 19).",
      metadata: {
        paymentObligationId: handoff.paymentObligationId,
        paymentRecordId: eventType === "PAYMENT_OBLIGATION_CREATED" ? null : handoff.paymentRecordId,
        payableAmount: handoff.payableAmount,
        paymentAmount: eventType === "PAYMENT_OBLIGATION_CREATED" ? null : handoff.paymentAmount,
        paymentStatus: handoff.paymentStatus,
        externalReference: handoff.externalReference,
        paymentTimestamp: handoff.paymentTimestamp,
      },
      reversalOfEntryId: null,
      createdByUserId: actorUserId,
    };

    const { entry, deduped } = await this.ledger.create(data);
    if (!deduped) {
      await this.audit.record({
        actorUserId,
        action: "LEDGER_ENTRY_CREATED",
        entityType: "DigitalTransactionLedger",
        entityId: entry.id,
        metadata: { eventType, transactionId: entry.transactionId, sourceModule: "MODULE_19_PAYMENT" },
      });
    }
    return entry;
  }

  // ---------------------------------------------------------------------
  // Module 14 integration — net realization snapshot
  // ---------------------------------------------------------------------

  /**
   * Step: "Module 14 Integration". Preserves the actual values Module 14
   * already computed and returned — never recalculated differently here
   * (Step: "The ledger must preserve the actual values returned by
   * Module 14"). UNKNOWN inputs stay null rather than being fabricated.
   */
  async recordNetRealizationSnapshot(input: RecordNetRealizationSnapshotInput, actorUserId: string | null): Promise<LedgerEntryRow> {
    if (input.netRealization !== null && input.netRealization < 0) {
      throw new LedgerDomainError("A net realization amount can never be negative on this ledger.", "INVALID_LEDGER_AMOUNT");
    }
    // A NET_REALIZATION_RECORDED entry with no resolved figure yet is not
    // a fabricated zero — it is simply not recorded (Step: "No Fabricated
    // Values" — UNKNOWN / NULL / NOT_RECORDED, never invented).
    if (input.netRealization === null) {
      throw new LedgerDomainError(
        "Net realization has not been resolved by Module 14 yet; nothing to record.",
        "LEDGER_UNKNOWN_SOURCE_EVENT",
      );
    }

    const data: CreateLedgerEntryData = {
      transactionId: input.transactionId,
      tradeId: input.tradeId,
      lotId: input.lotId,
      farmerId: input.farmerId,
      buyerId: input.buyerId,
      eventType: "NET_REALIZATION_RECORDED",
      direction: defaultDirectionFor("NET_REALIZATION_RECORDED"),
      amount: input.netRealization,
      currency: input.currency,
      sourceModule: "MODULE_14_NET_REALIZATION",
      sourceEntityId: input.netRealizationCalculationId,
      sourceEventId: input.netRealizationCalculationId,
      description: "Net realization snapshot recorded from Module 14.",
      metadata: {
        grossRevenue: input.grossRevenue,
        totalKnownCosts: input.totalKnownCosts,
        totalEstimatedCosts: input.totalEstimatedCosts,
        totalUserProvidedCosts: input.totalUserProvidedCosts,
        totalDeductions: input.totalDeductions,
        netRealization: input.netRealization,
      },
      reversalOfEntryId: null,
      createdByUserId: actorUserId,
    };

    const { entry, deduped } = await this.ledger.create(data);
    if (!deduped) {
      await this.audit.record({
        actorUserId,
        action: "LEDGER_ENTRY_CREATED",
        entityType: "DigitalTransactionLedger",
        entityId: entry.id,
        metadata: { eventType: "NET_REALIZATION_RECORDED", transactionId: entry.transactionId, sourceModule: "MODULE_14_NET_REALIZATION" },
      });
    }
    return entry;
  }

  // ---------------------------------------------------------------------
  // Reversals — Step: "Reversals"
  // ---------------------------------------------------------------------

  async createReversal(user: AuthenticatedUserContext, entryPublicId: string, input: CreateReversalInput, meta?: RequestMeta): Promise<LedgerEntryRow> {
    this.authorization.assertAdminOnly(user, "Only an administrator may reverse a ledger entry.");

    const original = await this.ledger.findByPublicId(entryPublicId);
    if (!original) throw new NotFoundError("Ledger entry not found.");

    if (original.eventType === "REVERSAL") {
      // Step: "Prevent reversing a reversal incorrectly".
      throw new LedgerDomainError("A reversal entry cannot itself be reversed.", "LEDGER_REVERSAL_OF_REVERSAL");
    }

    const existingReversals = await this.ledger.findReversalsOf(original.id);
    if (existingReversals.length > 0) {
      throw new LedgerDomainError("This ledger entry has already been reversed.", "LEDGER_ENTRY_ALREADY_REVERSED");
    }

    const data: CreateLedgerEntryData = {
      transactionId: original.transactionId,
      tradeId: original.tradeId,
      lotId: original.lotId,
      farmerId: original.farmerId,
      buyerId: original.buyerId,
      eventType: "REVERSAL",
      direction: opposite(original.direction),
      amount: decimalToNumber(original.amount),
      currency: original.currency,
      sourceModule: "REVERSAL",
      sourceEntityId: original.id,
      // Step: "Idempotency"/"Prevent duplicate reversal" — a reversal's own
      // idempotency key is scoped to the entry it reverses, so retrying
      // this exact request can never create a second reversal.
      sourceEventId: original.id,
      description: input.reason,
      metadata: {
        reversedEntryPublicId: original.publicId,
        reversedEventType: original.eventType,
        reversedAmount: decimalToNumber(original.amount),
        reason: input.reason,
      },
      reversalOfEntryId: original.id,
      createdByUserId: user.id,
    };

    const { entry, deduped } = await this.ledger.create(data);
    if (!deduped) {
      await this.audit.record({
        actorUserId: user.id,
        action: "LEDGER_REVERSAL_CREATED",
        entityType: "DigitalTransactionLedger",
        entityId: entry.id,
        metadata: { reversedEntryId: original.id, reason: input.reason },
        ...meta,
      });
    }
    return entry;
  }

  // ---------------------------------------------------------------------
  // Manual adjustments — Step: "Manual Adjustments"
  // ---------------------------------------------------------------------

  async createManualAdjustment(user: AuthenticatedUserContext, input: CreateManualAdjustmentInput, meta?: RequestMeta): Promise<LedgerEntryRow> {
    this.authorization.assertAdminOnly(user, "Only an administrator may create a manual ledger adjustment.");

    if (!input.reason || input.reason.trim().length === 0) {
      throw new LedgerDomainError("A manual adjustment requires an explicit reason.", "LEDGER_MANUAL_ADJUSTMENT_REQUIRES_REASON");
    }
    if (input.amount === 0) {
      throw new LedgerDomainError("A manual adjustment amount cannot be zero.", "INVALID_LEDGER_AMOUNT");
    }

    // Step: "createdBy" is required, "amount" may be signed (a negative
    // amount is a debit-shaped correction) — sign-of-amount decides
    // direction, magnitude is always stored positive on the row.
    const direction = input.amount > 0 ? "CREDIT" : "DEBIT";
    const amount = Math.abs(input.amount);
    // A manual adjustment's own idempotency key: since it has no
    // upstream event to replay, sourceEventId is a fresh identifier per
    // call — a manual adjustment is a one-off admin action, never a
    // webhook retry target (Step: "never subject to replay").
    const sourceEventId = `manual:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const data: CreateLedgerEntryData = {
      transactionId: input.transactionId,
      tradeId: input.tradeId ?? null,
      lotId: input.lotId ?? null,
      farmerId: input.farmerId ?? null,
      buyerId: input.buyerId ?? null,
      eventType: "MANUAL_ADJUSTMENT",
      direction,
      amount,
      currency: input.currency,
      sourceModule: "MANUAL_ADJUSTMENT",
      sourceEntityId: null,
      sourceEventId,
      description: input.reason,
      metadata: { reason: input.reason, reference: input.reference ?? null, createdBy: user.id },
      reversalOfEntryId: null,
      createdByUserId: user.id,
    };

    const { entry } = await this.ledger.create(data);
    await this.audit.record({
      actorUserId: user.id,
      action: "LEDGER_MANUAL_ADJUSTMENT_CREATED",
      entityType: "DigitalTransactionLedger",
      entityId: entry.id,
      metadata: { transactionId: entry.transactionId, amount: input.amount, reason: input.reason },
      ...meta,
    });
    return entry;
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async getEntry(user: AuthenticatedUserContext, publicId: string): Promise<LedgerEntryDTO> {
    const entry = await this.ledger.findByPublicId(publicId);
    if (!entry) throw new NotFoundError("Ledger entry not found.");
    await this.assertCanView(user, entry);
    return this.toDTO(entry);
  }

  async getTransactionLedger(user: AuthenticatedUserContext, transactionId: string): Promise<LedgerEntryDTO[]> {
    const entries = await this.ledger.listByTransactionId(transactionId);
    if (entries.length === 0) return [];
    // Every entry in a transaction shares the same farmer/buyer scope by
    // construction (see recordPaymentEvent/recordNetRealizationSnapshot),
    // so checking the first entry is sufficient and avoids N authorization
    // round-trips.
    await this.assertCanView(user, entries[0]);
    return entries.map((e) => this.toDTO(e));
  }

  async listByFarmer(user: AuthenticatedUserContext, farmerId: string, filters: Omit<LedgerListFilters, "farmerId">): Promise<{ items: LedgerEntryDTO[]; total: number }> {
    if (user.role !== "ADMIN") {
      const callerFarmerProfileId = await this.resolveCallerFarmerProfileId(user);
      if (!callerFarmerProfileId || callerFarmerProfileId !== farmerId) {
        throw new AuthorizationError("You do not have permission to view this farmer's ledger.");
      }
    }
    const page = await this.ledger.list({ ...filters, farmerId });
    return { items: page.items.map((e) => this.toDTO(e)), total: page.total };
  }

  async listByBuyer(user: AuthenticatedUserContext, buyerId: string, filters: Omit<LedgerListFilters, "buyerId">): Promise<{ items: LedgerEntryDTO[]; total: number }> {
    if (user.role !== "ADMIN") {
      const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
      if (!callerBuyerProfileId || callerBuyerProfileId !== buyerId) {
        throw new AuthorizationError("You do not have permission to view this buyer's ledger.");
      }
    }
    const page = await this.ledger.list({ ...filters, buyerId });
    return { items: page.items.map((e) => this.toDTO(e)), total: page.total };
  }

  /**
   * Step: "Transaction Summary" / "Balance". grossValue/amountPaid/
   * amountOutstanding/status are read from Module 19's own
   * PaymentObligation (the authoritative source for all four — see the
   * DTO's own field comments) rather than reconstructed purely from
   * ledger entries, since PaymentObligation is already the
   * concurrency-safe authoritative balance (Step 22's row lock). The
   * ledger's own balanceAfter (never persisted — see the schema's module
   * comment) is instead reconstructed here only for entries array
   * ordering/display, not as the summary's source of truth.
   */
  async getTransactionSummary(user: AuthenticatedUserContext, transactionId: string): Promise<TransactionSummaryDTO> {
    const entries = await this.ledger.listByTransactionId(transactionId);
    if (entries.length === 0) throw new NotFoundError("No ledger entries found for this transaction.");
    await this.assertCanView(user, entries[0]);

    const obligation = await this.prisma.paymentObligation.findUnique({ where: { deliveryId: transactionId } });

    const deductionEvents: LedgerEventType[] = ["LOGISTICS_COST_RECORDED", "STORAGE_COST_RECORDED", "OTHER_DEDUCTION_RECORDED"];
    const activeDeductions = entries.filter((e) => deductionEvents.includes(e.eventType) && !this.isReversed(e, entries));
    const deductions = activeDeductions.length > 0 ? activeDeductions.reduce((sum, e) => sum + decimalToNumber(e.amount), 0) : null;

    const netRealizationEntry = entries.find((e) => e.eventType === "NET_REALIZATION_RECORDED" && !this.isReversed(e, entries));

    return {
      transactionId,
      currency: obligation ? obligation.currency : entries[0].currency,
      grossValue: obligation ? decimalToNumber(obligation.grossAmount) : null,
      deductions,
      netRealization: netRealizationEntry ? decimalToNumber(netRealizationEntry.amount) : null,
      amountPaid: obligation ? decimalToNumber(obligation.amountPaid) : this.calculateBalanceFromPayments(entries),
      amountOutstanding: obligation ? decimalToNumber(obligation.amountDue) : null,
      status: obligation ? mapObligationStatusToLedgerStatus(obligation.status) : null,
      entries: entries.map((e) => this.toDTO(e)),
    };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private isReversed(entry: LedgerEntryRow, allEntries: LedgerEntryRow[]): boolean {
    return allEntries.some((e) => e.reversalOfEntryId === entry.id);
  }

  /** Step: "Balance" deterministic reconstruction — sums only
   * balance-affecting entries (see isBalanceAffecting) in
   * (createdAt, id) order; used only as a fallback display value when no
   * PaymentObligation exists yet for this transactionId. */
  private calculateBalanceFromPayments(entries: LedgerEntryRow[]): number {
    return entries
      .filter((e) => isBalanceAffecting(e.eventType) && e.eventType !== "PAYMENT_OBLIGATION_CREATED")
      .reduce((sum, e) => sum + Math.abs(signedAmount(e.direction, decimalToNumber(e.amount))), 0);
  }

  private async assertCanView(user: AuthenticatedUserContext, entry: LedgerEntryRow): Promise<void> {
    const callerFarmerProfileId = await this.resolveCallerFarmerProfileId(user);
    const callerBuyerProfileId = await this.resolveCallerBuyerProfileId(user);
    const allowed = await this.authorization.canView(user, entry, callerFarmerProfileId, callerBuyerProfileId);
    if (!allowed) throw new AuthorizationError("You do not have permission to view this ledger entry.");
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

  private toDTO(entry: LedgerEntryRow): LedgerEntryDTO {
    return {
      publicId: entry.publicId,
      transactionId: entry.transactionId,
      tradeId: entry.tradeId,
      lotId: entry.lotId,
      farmerId: entry.farmerId,
      buyerId: entry.buyerId,
      eventType: entry.eventType,
      direction: entry.direction,
      amount: decimalToNumber(entry.amount),
      currency: entry.currency,
      sourceModule: entry.sourceModule,
      sourceEntityId: entry.sourceEntityId,
      description: entry.description,
      metadata: (entry.metadata as Record<string, unknown> | null) ?? null,
      reversalOfEntryId: entry.reversalOfEntryId,
      createdAt: entry.createdAt.toISOString(),
    };
  }
}

/** Step: "Financial Status" — derived read-only from Module 19's own
 * PaymentObligationStatus; never a second state machine. OVERDUE and
 * CANCELLED map onto UNPAID/DISPUTED's neighbors rather than inventing
 * new ledger-only statuses not in the build spec's own list. */
function mapObligationStatusToLedgerStatus(status: PaymentObligationStatus): LedgerObligationStatus {
  switch (status) {
    case "PENDING":
    case "OVERDUE":
      return "UNPAID";
    case "PARTIALLY_PAID":
      return "PARTIALLY_PAID";
    case "PAID":
    case "OVERPAID":
      return "PAID";
    case "DISPUTED":
      return "DISPUTED";
    case "CANCELLED":
      return "UNPAID";
    default:
      return "UNPAID";
  }
}
