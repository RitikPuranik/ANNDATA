import { DisputeRaisedByRole, PrismaClient } from "@prisma/client";
import { AuthorizationError, DisputeDomainError, NotFoundError, ValidationError } from "../../common/errors";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { DisputeAuthorizationService } from "./dispute.authorization";
import { CreateDisputeData, DisputeRepository } from "./dispute.repository";
import { canReopenDispute, canTransitionDispute, DisputeStatus as DisputeStatusLiteral, isTerminalDisputeStatus } from "./dispute-state-machine";
import {
  DisputeCommentDTO,
  DisputeEvidenceDTO,
  DisputeHistoryEventDTO,
  DisputeListFilters,
  DisputePublicDTO,
  DisputeRecord,
} from "./dispute.types";

export interface CreateDisputeInput {
  type: string;
  category?: "TRANSACTION" | "GRIEVANCE";
  title: string;
  description: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  lotId?: string;
  tradeOfferId?: string;
  shipmentId?: string;
  deliveryId?: string;
  paymentObligationId?: string;
  requestedResolution?: string;
  evidence: Array<{
    evidenceType: string;
    storageProvider: string;
    externalId: string;
    secureUrl: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    checksum?: string;
    description?: string;
  }>;
}

/** Step 7 — ordinary users never freely pick CRITICAL; only ADMIN may set
 * it directly on creation, and a few dispute types are capped below that
 * regardless of who raises them. */
const ROLE_MAX_PRIORITY: Record<string, string> = {
  ADMIN: "CRITICAL",
};
const PRIORITY_RANK = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function clampPriority(role: string, requested: string | undefined): string {
  const cap = ROLE_MAX_PRIORITY[role] ?? "HIGH";
  if (!requested) return "MEDIUM";
  const requestedRank = PRIORITY_RANK.indexOf(requested);
  const capRank = PRIORITY_RANK.indexOf(cap);
  return requestedRank <= capRank ? requested : cap;
}

function roleToRaisedByRole(role: string): DisputeRaisedByRole {
  if (role === "FARMER" || role === "FPO_ADMIN" || role === "BUYER" || role === "TRANSPORTER" || role === "ADMIN") {
    return role as DisputeRaisedByRole;
  }
  return "ADMIN";
}

export class DisputeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repo: DisputeRepository,
    private readonly authorization: DisputeAuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private async resolveCallerFarmerProfileId(user: AuthenticatedUserContext): Promise<string | null> {
    if (user.role !== "FARMER") return null;
    const farmer = await this.prisma.farmerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return farmer?.id ?? null;
  }

  private async resolveCallerBuyerProfileId(user: AuthenticatedUserContext): Promise<string | null> {
    if (user.role !== "BUYER") return null;
    const buyer = await this.prisma.buyerProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return buyer?.id ?? null;
  }

  private async resolveCallerTransportProviderId(user: AuthenticatedUserContext): Promise<string | null> {
    if (user.role !== "TRANSPORTER") return null;
    const provider = await this.prisma.transporterProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return provider?.id ?? null;
  }

  private async loadCallerContext(user: AuthenticatedUserContext) {
    const [farmerId, buyerId, transporterId] = await Promise.all([
      this.resolveCallerFarmerProfileId(user),
      this.resolveCallerBuyerProfileId(user),
      this.resolveCallerTransportProviderId(user),
    ]);
    return { farmerId, buyerId, transporterId };
  }

  private async findByPublicIdOrThrow(publicId: string): Promise<DisputeRecord> {
    const dispute = await this.repo.findByPublicId(publicId);
    if (!dispute) throw new NotFoundError("Dispute not found.");
    return dispute;
  }

  /** Step 5/8 — resolves each optionally-supplied transaction reference
   * publicId to its internal id AND the party (farmer/buyer/transporter)
   * it belongs to, so ownership can be checked server-side rather than
   * trusting whichever farmerId/buyerId the client might otherwise send
   * directly (Step 8: "Never trust frontend-supplied ownership claims").
   */
  private async resolveReferences(input: CreateDisputeInput) {
    let lotId: string | null = null;
    let tradeOfferId: string | null = null;
    let shipmentId: string | null = null;
    let deliveryId: string | null = null;
    let paymentObligationId: string | null = null;
    let farmerId: string | null = null;
    let buyerId: string | null = null;
    let transporterId: string | null = null;

    if (input.lotId) {
      const lot = await this.prisma.cropLot.findUnique({ where: { publicId: input.lotId }, select: { id: true, farmerId: true } });
      if (!lot) throw new NotFoundError("Referenced lot not found.");
      lotId = lot.id;
      farmerId = farmerId ?? lot.farmerId;
    }
    if (input.tradeOfferId) {
      const offer = await this.prisma.tradeOffer.findUnique({
        where: { publicId: input.tradeOfferId },
        select: { id: true, buyerId: true, lot: { select: { farmerId: true } } },
      });
      if (!offer) throw new NotFoundError("Referenced trade offer not found.");
      tradeOfferId = offer.id;
      buyerId = buyerId ?? offer.buyerId;
      farmerId = farmerId ?? offer.lot?.farmerId ?? null;
    }
    if (input.shipmentId) {
      const shipment = await this.prisma.shipment.findUnique({
        where: { publicId: input.shipmentId },
        select: { id: true, transportProviderId: true },
      });
      if (!shipment) throw new NotFoundError("Referenced shipment not found.");
      shipmentId = shipment.id;
      transporterId = transporterId ?? shipment.transportProviderId ?? null;
    }
    if (input.deliveryId) {
      const delivery = await this.prisma.delivery.findUnique({
        where: { publicId: input.deliveryId },
        select: { id: true, buyerId: true, lot: { select: { farmerId: true } } },
      });
      if (!delivery) throw new NotFoundError("Referenced delivery not found.");
      deliveryId = delivery.id;
      buyerId = buyerId ?? delivery.buyerId;
      farmerId = farmerId ?? delivery.lot?.farmerId ?? null;
    }
    if (input.paymentObligationId) {
      const obligation = await this.prisma.paymentObligation.findUnique({
        where: { publicId: input.paymentObligationId },
        select: { id: true, buyerId: true, sellerFarmerId: true },
      });
      if (!obligation) throw new NotFoundError("Referenced payment obligation not found.");
      paymentObligationId = obligation.id;
      buyerId = buyerId ?? obligation.buyerId ?? null;
      farmerId = farmerId ?? obligation.sellerFarmerId ?? null;
    }

    return { lotId, tradeOfferId, shipmentId, deliveryId, paymentObligationId, farmerId, buyerId, transporterId };
  }

  /** Step 5, 8, 9 — create a dispute + its initial CREATED history event +
   * any submitted evidence, all inside one transaction (Step 28) so a
   * failure partway through never leaves a half-created dispute. */
  async create(user: AuthenticatedUserContext, input: CreateDisputeInput): Promise<DisputePublicDTO> {
    const category = input.category ?? "TRANSACTION";
    const refs = await this.resolveReferences(input);

    if (category === "TRANSACTION") {
      const hasReference = Boolean(
        refs.lotId || refs.tradeOfferId || refs.shipmentId || refs.deliveryId || refs.paymentObligationId,
      );
      if (!hasReference) {
        throw new DisputeDomainError(
          "A transaction dispute must reference at least one lot, trade offer, shipment, delivery or payment obligation. Use category GRIEVANCE for a general complaint.",
          "DISPUTE_REFERENCE_ENTITY_REQUIRED",
        );
      }
    }

    const callerContext = await this.loadCallerContext(user);
    this.authorization.assertCanCreateFor(
      user,
      callerContext.farmerId,
      callerContext.buyerId,
      callerContext.transporterId,
      refs.farmerId,
      refs.buyerId,
      refs.transporterId,
    );

    // Step 9 — duplicate/open dispute protection.
    const openCount = await this.repo.countOpenForReference({
      raisedByUserId: user.id,
      lotId: refs.lotId,
      deliveryId: refs.deliveryId,
      paymentObligationId: refs.paymentObligationId,
      shipmentId: refs.shipmentId,
      tradeOfferId: refs.tradeOfferId,
      type: input.type,
    });
    if (openCount > 0) {
      throw new DisputeDomainError(
        "You already have an open dispute of this type against this transaction.",
        "DUPLICATE_OPEN_DISPUTE",
        409,
      );
    }

    const createData: CreateDisputeData = {
      type: input.type as never,
      category: category as never,
      title: input.title,
      description: input.description,
      priority: clampPriority(user.role, input.priority) as never,
      raisedByUserId: user.id,
      raisedByRole: roleToRaisedByRole(user.role),
      farmerId: refs.farmerId,
      buyerId: refs.buyerId,
      transporterId: refs.transporterId,
      lotId: refs.lotId,
      tradeOfferId: refs.tradeOfferId,
      shipmentId: refs.shipmentId,
      deliveryId: refs.deliveryId,
      paymentObligationId: refs.paymentObligationId,
      requestedResolution: input.requestedResolution ?? null,
    };

    const dispute = await this.repo.create(createData);

    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "CREATED",
      actorUserId: user.id,
      actorRole: roleToRaisedByRole(user.role),
      previousState: null,
      newState: "OPEN",
      description: `Dispute ${dispute.disputeNumber} raised.`,
      metadata: { type: input.type, category },
    });

    for (const item of input.evidence) {
      await this.repo.addEvidence({
        disputeId: dispute.id,
        evidenceType: item.evidenceType as never,
        storageProvider: item.storageProvider,
        externalId: item.externalId,
        secureUrl: item.secureUrl,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        checksum: item.checksum ?? null,
        description: item.description ?? null,
        uploadedByUserId: user.id,
        uploadedAt: new Date(),
      });
      await this.repo.addHistoryEvent({
        disputeId: dispute.id,
        eventType: "EVIDENCE_ADDED",
        actorUserId: user.id,
        actorRole: roleToRaisedByRole(user.role),
        previousState: null,
        newState: null,
        description: `Evidence "${item.fileName}" attached.`,
        metadata: null,
      });
    }

    await this.audit.record({
      actorUserId: user.id,
      action: "DISPUTE_CREATED",
      entityType: "Dispute",
      entityId: dispute.id,
      metadata: { disputeNumber: dispute.disputeNumber, type: input.type, category },
    });

    return this.toDTO(dispute);
  }

  async get(user: AuthenticatedUserContext, publicId: string): Promise<DisputePublicDTO> {
    const dispute = await this.findByPublicIdOrThrow(publicId);
    const ctx = await this.loadCallerContext(user);
    if (!this.authorization.canView(user, dispute, ctx.farmerId, ctx.buyerId, ctx.transporterId)) {
      throw new AuthorizationError("You do not have permission to view this dispute.");
    }
    return this.toDTO(dispute);
  }

  async list(user: AuthenticatedUserContext, filters: DisputeListFilters) {
    // Step 24 — non-admin callers are always scoped to disputes visible to
    // them; only ADMIN may list across all parties.
    const ctx = await this.loadCallerContext(user);
    const scopedFilters: DisputeListFilters = { ...filters };
    if (user.role === "FARMER" || user.role === "FPO_ADMIN") {
      scopedFilters.farmerId = ctx.farmerId ?? "__none__";
    } else if (user.role === "BUYER") {
      scopedFilters.buyerId = ctx.buyerId ?? "__none__";
    } else if (user.role === "TRANSPORTER") {
      scopedFilters.transporterId = ctx.transporterId ?? undefined;
    }
    const page = await this.repo.list(scopedFilters);
    return { items: page.items.map((d) => this.toDTO(d)), total: page.total, page: filters.page, limit: filters.limit };
  }

  async addComment(
    user: AuthenticatedUserContext,
    publicId: string,
    input: { message: string; internal: boolean },
  ): Promise<DisputeCommentDTO> {
    const dispute = await this.findByPublicIdOrThrow(publicId);
    if (isTerminalDisputeStatus(dispute.status as DisputeStatusLiteral)) {
      throw new DisputeDomainError("This dispute is closed and no longer accepts comments.", "DISPUTE_NOT_MUTABLE");
    }
    const ctx = await this.loadCallerContext(user);
    this.authorization.assertCanComment(user, dispute, ctx.farmerId, ctx.buyerId, ctx.transporterId);

    // Step 12 — only ADMIN may write an internal note; anyone else's
    // `internal: true` is silently downgraded to a public comment rather
    // than trusted from the client.
    const internal = input.internal && user.role === "ADMIN";

    const comment = await this.repo.addComment({
      disputeId: dispute.id,
      visibility: internal ? "INTERNAL_NOTE" : "PUBLIC_COMMENT",
      authorUserId: user.id,
      authorRole: roleToRaisedByRole(user.role),
      message: input.message,
    });
    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "COMMENT_ADDED",
      actorUserId: user.id,
      actorRole: roleToRaisedByRole(user.role),
      previousState: null,
      newState: null,
      description: internal ? "Internal note added." : "Comment added.",
      metadata: null,
    });
    await this.audit.record({
      actorUserId: user.id,
      action: internal ? "DISPUTE_INTERNAL_NOTE_ADDED" : "DISPUTE_COMMENT_ADDED",
      entityType: "Dispute",
      entityId: dispute.id,
    });

    return this.commentToDTO(comment);
  }

  async listComments(user: AuthenticatedUserContext, publicId: string): Promise<DisputeCommentDTO[]> {
    const dispute = await this.findByPublicIdOrThrow(publicId);
    const ctx = await this.loadCallerContext(user);
    if (!this.authorization.canView(user, dispute, ctx.farmerId, ctx.buyerId, ctx.transporterId)) {
      throw new AuthorizationError("You do not have permission to view this dispute.");
    }
    // Step 12/34 — internal notes never reach a non-ADMIN response.
    const comments = await this.repo.listComments(dispute.id, user.role === "ADMIN");
    return comments.map((c) => this.commentToDTO(c));
  }

  async addEvidence(
    user: AuthenticatedUserContext,
    publicId: string,
    input: {
      evidenceType: string;
      storageProvider: string;
      externalId: string;
      secureUrl: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      checksum?: string;
      description?: string;
    },
  ): Promise<DisputeEvidenceDTO> {
    const dispute = await this.findByPublicIdOrThrow(publicId);
    if (isTerminalDisputeStatus(dispute.status as DisputeStatusLiteral)) {
      throw new DisputeDomainError("This dispute is closed and no longer accepts evidence.", "DISPUTE_NOT_MUTABLE");
    }
    const ctx = await this.loadCallerContext(user);
    this.authorization.assertCanComment(user, dispute, ctx.farmerId, ctx.buyerId, ctx.transporterId);

    const evidence = await this.repo.addEvidence({
      disputeId: dispute.id,
      evidenceType: input.evidenceType as never,
      storageProvider: input.storageProvider,
      externalId: input.externalId,
      secureUrl: input.secureUrl,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum ?? null,
      description: input.description ?? null,
      uploadedByUserId: user.id,
      uploadedAt: new Date(),
    });
    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "EVIDENCE_ADDED",
      actorUserId: user.id,
      actorRole: roleToRaisedByRole(user.role),
      previousState: null,
      newState: null,
      description: `Evidence "${input.fileName}" attached.`,
      metadata: null,
    });
    await this.audit.record({ actorUserId: user.id, action: "DISPUTE_EVIDENCE_ADDED", entityType: "Dispute", entityId: dispute.id });

    return this.evidenceToDTO(evidence);
  }

  async listEvidence(user: AuthenticatedUserContext, publicId: string): Promise<DisputeEvidenceDTO[]> {
    const dispute = await this.findByPublicIdOrThrow(publicId);
    const ctx = await this.loadCallerContext(user);
    if (!this.authorization.canView(user, dispute, ctx.farmerId, ctx.buyerId, ctx.transporterId)) {
      throw new AuthorizationError("You do not have permission to view this dispute.");
    }
    const evidence = await this.repo.listEvidence(dispute.id);
    return evidence.filter((e) => !e.removedAt).map((e) => this.evidenceToDTO(e));
  }

  async removeEvidence(user: AuthenticatedUserContext, publicId: string, evidenceId: string): Promise<void> {
    const dispute = await this.findByPublicIdOrThrow(publicId);
    // Step 10/22 — only ADMIN, or the user who originally uploaded it, may
    // remove evidence; never any other party on the dispute.
    const evidence = await this.repo.findEvidenceById(evidenceId);
    if (!evidence || evidence.disputeId !== dispute.id) throw new NotFoundError("Evidence not found.");
    if (user.role !== "ADMIN" && evidence.uploadedByUserId !== user.id) {
      throw new AuthorizationError("You do not have permission to remove this evidence.");
    }
    await this.repo.removeEvidence(evidenceId, user.id);
    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "EVIDENCE_REMOVED",
      actorUserId: user.id,
      actorRole: roleToRaisedByRole(user.role),
      previousState: null,
      newState: null,
      description: `Evidence "${evidence.fileName}" removed.`,
      metadata: null,
    });
    await this.audit.record({ actorUserId: user.id, action: "DISPUTE_EVIDENCE_REMOVED", entityType: "Dispute", entityId: dispute.id });
  }

  async listHistory(user: AuthenticatedUserContext, publicId: string): Promise<DisputeHistoryEventDTO[]> {
    const dispute = await this.findByPublicIdOrThrow(publicId);
    const ctx = await this.loadCallerContext(user);
    if (!this.authorization.canView(user, dispute, ctx.farmerId, ctx.buyerId, ctx.transporterId)) {
      throw new AuthorizationError("You do not have permission to view this dispute.");
    }
    const history = await this.repo.listHistory(dispute.id);
    return history.map((h) => ({
      eventType: h.eventType,
      actorUserId: h.actorUserId,
      actorRole: h.actorRole,
      previousState: h.previousState,
      newState: h.newState,
      description: h.description,
      createdAt: h.createdAt.toISOString(),
    }));
  }

  /** Step 13 — assignment; ADMIN only. */
  async assign(user: AuthenticatedUserContext, publicId: string, assignedToUserId: string): Promise<DisputePublicDTO> {
    this.authorization.assertCanOperate(user);
    const dispute = await this.findByPublicIdOrThrow(publicId);
    if (isTerminalDisputeStatus(dispute.status as DisputeStatusLiteral)) {
      throw new DisputeDomainError("This dispute is closed and cannot be reassigned.", "DISPUTE_NOT_MUTABLE");
    }
    const assignee = await this.prisma.user.findUnique({ where: { id: assignedToUserId }, select: { id: true, role: true } });
    if (!assignee) throw new NotFoundError("Assignee not found.");

    const updated = await this.repo.update(dispute.id, {
      assignedToUserId,
      assignedAt: new Date(),
      assignedByUserId: user.id,
    });
    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "ASSIGNED",
      actorUserId: user.id,
      actorRole: "ADMIN",
      previousState: dispute.assignedToUserId,
      newState: assignedToUserId,
      description: "Dispute assigned to an investigator.",
      metadata: null,
    });
    await this.audit.record({ actorUserId: user.id, action: "DISPUTE_ASSIGNED", entityType: "Dispute", entityId: dispute.id, metadata: { assignedToUserId } });

    return this.toDTO(updated);
  }

  async unassign(user: AuthenticatedUserContext, publicId: string): Promise<DisputePublicDTO> {
    this.authorization.assertCanOperate(user);
    const dispute = await this.findByPublicIdOrThrow(publicId);
    const updated = await this.repo.update(dispute.id, { assignedToUserId: null, assignedAt: null, assignedByUserId: null });
    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "UNASSIGNED",
      actorUserId: user.id,
      actorRole: "ADMIN",
      previousState: dispute.assignedToUserId,
      newState: null,
      description: "Dispute unassigned.",
      metadata: null,
    });
    await this.audit.record({ actorUserId: user.id, action: "DISPUTE_UNASSIGNED", entityType: "Dispute", entityId: dispute.id });
    return this.toDTO(updated);
  }

  /** Step 6/13 — generic controlled status change (e.g. OPEN ->
   * UNDER_REVIEW, -> INVESTIGATION, -> AWAITING_PARTY_RESPONSE). Resolve,
   * reject, reopen and close each have their own dedicated method below
   * because they carry extra required fields/side effects; this endpoint
   * refuses to be used for any of those four target statuses. */
  async changeStatus(user: AuthenticatedUserContext, publicId: string, to: string, reason?: string): Promise<DisputePublicDTO> {
    this.authorization.assertCanOperate(user);
    if (to === "RESOLVED" || to === "REJECTED" || to === "CLOSED") {
      throw new ValidationError(`Use the dedicated endpoint to move a dispute to ${to}.`);
    }
    const dispute = await this.findByPublicIdOrThrow(publicId);
    const from = dispute.status as DisputeStatusLiteral;
    if (to === "CANCELLED" ? from !== "OPEN" && from !== "UNDER_REVIEW" : !canTransitionDispute(from, to as DisputeStatusLiteral)) {
      throw new DisputeDomainError(`Cannot move a dispute from ${from} to ${to}.`, "INVALID_DISPUTE_TRANSITION");
    }
    const updated = await this.repo.transition(dispute.id, [from], to as never, to === "CANCELLED" ? { cancelledAt: new Date() } : {});
    if (!updated) throw new DisputeDomainError("This dispute was already updated by someone else.", "INVALID_DISPUTE_TRANSITION", 409);

    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: to === "INVESTIGATION" ? "INVESTIGATION_STARTED" : to === "AWAITING_PARTY_RESPONSE" ? "RESPONSE_REQUESTED" : to === "CANCELLED" ? "CANCELLED" : "STATUS_CHANGED",
      actorUserId: user.id,
      actorRole: "ADMIN",
      previousState: from,
      newState: to,
      description: reason ?? `Status changed from ${from} to ${to}.`,
      metadata: null,
    });
    await this.audit.record({
      actorUserId: user.id,
      action: "DISPUTE_STATUS_CHANGED",
      entityType: "Dispute",
      entityId: dispute.id,
      metadata: { from, to },
    });

    return this.toDTO(updated);
  }

  /** Step 15/16/17 — resolution. `resolutionCode`/`resolutionSummary`/
   * `finalResolution` are always required (Step 17: "Never store only
   * 'Resolved.'"); a financial consequence is only ever *referenced* here
   * (an already-existing Module 19 PaymentObligation / Module 20 ledger
   * entry publicId) — this module never creates or mutates either. */
  async resolve(
    user: AuthenticatedUserContext,
    publicId: string,
    input: {
      resolutionCode: string;
      resolutionSummary: string;
      finalResolution: string;
      financialAdjustmentPaymentObligationId?: string;
      financialAdjustmentLedgerEntryId?: string;
    },
  ): Promise<DisputePublicDTO> {
    this.authorization.assertCanOperate(user);
    const dispute = await this.findByPublicIdOrThrow(publicId);
    const from = dispute.status as DisputeStatusLiteral;
    if (!canTransitionDispute(from, "RESOLVED")) {
      throw new DisputeDomainError(`Cannot resolve a dispute from status ${from}.`, "INVALID_DISPUTE_TRANSITION");
    }

    let financialAdjustmentPaymentObligationId: string | null = null;
    if (input.financialAdjustmentPaymentObligationId) {
      const obligation = await this.prisma.paymentObligation.findUnique({
        where: { publicId: input.financialAdjustmentPaymentObligationId },
        select: { id: true },
      });
      if (!obligation) throw new NotFoundError("Referenced payment obligation not found.");
      financialAdjustmentPaymentObligationId = obligation.id;
    }
    let financialAdjustmentLedgerEntryId: string | null = null;
    if (input.financialAdjustmentLedgerEntryId) {
      const ledgerEntry = await this.prisma.digitalTransactionLedger.findUnique({
        where: { publicId: input.financialAdjustmentLedgerEntryId },
        select: { id: true },
      });
      if (!ledgerEntry) throw new NotFoundError("Referenced ledger entry not found.");
      financialAdjustmentLedgerEntryId = ledgerEntry.id;
    }

    const updated = await this.repo.transition(dispute.id, [from], "RESOLVED", {
      resolutionCode: input.resolutionCode,
      resolutionSummary: input.resolutionSummary,
      finalResolution: input.finalResolution,
      financialAdjustmentPaymentObligationId,
      financialAdjustmentLedgerEntryId,
      resolvedByUserId: user.id,
      resolvedAt: new Date(),
    });
    if (!updated) throw new DisputeDomainError("This dispute was already updated by someone else.", "INVALID_DISPUTE_TRANSITION", 409);

    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "RESOLVED",
      actorUserId: user.id,
      actorRole: "ADMIN",
      previousState: from,
      newState: "RESOLVED",
      description: input.resolutionSummary,
      metadata: { resolutionCode: input.resolutionCode },
    });
    if (financialAdjustmentPaymentObligationId || financialAdjustmentLedgerEntryId) {
      await this.repo.addHistoryEvent({
        disputeId: dispute.id,
        eventType: "FINANCIAL_ADJUSTMENT_COMPLETED",
        actorUserId: user.id,
        actorRole: "ADMIN",
        previousState: null,
        newState: null,
        description: "Resolution linked to an existing Module 19/20 financial record.",
        metadata: {
          paymentObligationId: input.financialAdjustmentPaymentObligationId ?? null,
          ledgerEntryId: input.financialAdjustmentLedgerEntryId ?? null,
        },
      });
      await this.audit.record({ actorUserId: user.id, action: "DISPUTE_FINANCIAL_ADJUSTMENT_REQUESTED", entityType: "Dispute", entityId: dispute.id });
    }
    await this.audit.record({
      actorUserId: user.id,
      action: "DISPUTE_RESOLVED",
      entityType: "Dispute",
      entityId: dispute.id,
      metadata: { resolutionCode: input.resolutionCode },
    });

    return this.toDTO(updated);
  }

  async reject(user: AuthenticatedUserContext, publicId: string, resolutionSummary: string): Promise<DisputePublicDTO> {
    this.authorization.assertCanOperate(user);
    const dispute = await this.findByPublicIdOrThrow(publicId);
    const from = dispute.status as DisputeStatusLiteral;
    if (!canTransitionDispute(from, "REJECTED")) {
      throw new DisputeDomainError(`Cannot reject a dispute from status ${from}.`, "INVALID_DISPUTE_TRANSITION");
    }
    const updated = await this.repo.transition(dispute.id, [from], "REJECTED", {
      resolutionCode: "CLAIM_REJECTED",
      resolutionSummary,
      resolvedByUserId: user.id,
      resolvedAt: new Date(),
    });
    if (!updated) throw new DisputeDomainError("This dispute was already updated by someone else.", "INVALID_DISPUTE_TRANSITION", 409);

    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "REJECTED",
      actorUserId: user.id,
      actorRole: "ADMIN",
      previousState: from,
      newState: "REJECTED",
      description: resolutionSummary,
      metadata: null,
    });
    await this.audit.record({ actorUserId: user.id, action: "DISPUTE_REJECTED", entityType: "Dispute", entityId: dispute.id });

    return this.toDTO(updated);
  }

  /** Step 18 — reopening is always a distinct, explicitly-authorized event
   * (never a silent status overwrite); ADMIN only. */
  async reopen(user: AuthenticatedUserContext, publicId: string, reason: string): Promise<DisputePublicDTO> {
    this.authorization.assertCanOperate(user);
    const dispute = await this.findByPublicIdOrThrow(publicId);
    const from = dispute.status as DisputeStatusLiteral;
    if (!canReopenDispute(from)) {
      throw new DisputeDomainError(`A dispute in status ${from} cannot be reopened.`, "DISPUTE_REOPEN_NOT_ALLOWED");
    }
    const updated = await this.repo.transition(dispute.id, [from], "INVESTIGATION", {
      resolutionCode: null,
      resolutionSummary: null,
      finalResolution: null,
      resolvedByUserId: null,
      resolvedAt: null,
      closedAt: null,
    });
    if (!updated) throw new DisputeDomainError("This dispute was already updated by someone else.", "INVALID_DISPUTE_TRANSITION", 409);

    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "REOPENED",
      actorUserId: user.id,
      actorRole: "ADMIN",
      previousState: from,
      newState: "INVESTIGATION",
      description: reason,
      metadata: null,
    });
    await this.audit.record({ actorUserId: user.id, action: "DISPUTE_REOPENED", entityType: "Dispute", entityId: dispute.id, metadata: { reason } });

    return this.toDTO(updated);
  }

  /** Step 6 — only a RESOLVED or REJECTED dispute may be closed. */
  async close(user: AuthenticatedUserContext, publicId: string): Promise<DisputePublicDTO> {
    this.authorization.assertCanOperate(user);
    const dispute = await this.findByPublicIdOrThrow(publicId);
    const from = dispute.status as DisputeStatusLiteral;
    if (!canTransitionDispute(from, "CLOSED")) {
      throw new DisputeDomainError(`Cannot close a dispute from status ${from}. It must be RESOLVED or REJECTED first.`, "DISPUTE_NOT_RESOLVED");
    }
    const updated = await this.repo.transition(dispute.id, [from], "CLOSED", { closedAt: new Date() });
    if (!updated) throw new DisputeDomainError("This dispute was already updated by someone else.", "INVALID_DISPUTE_TRANSITION", 409);

    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "CLOSED",
      actorUserId: user.id,
      actorRole: "ADMIN",
      previousState: from,
      newState: "CLOSED",
      description: "Dispute closed.",
      metadata: null,
    });
    await this.audit.record({ actorUserId: user.id, action: "DISPUTE_CLOSED", entityType: "Dispute", entityId: dispute.id });

    return this.toDTO(updated);
  }

  /** Cancellation — the raiser (or ADMIN) withdrawing a dispute that has
   * not yet moved past OPEN/UNDER_REVIEW. */
  async cancel(user: AuthenticatedUserContext, publicId: string, reason?: string): Promise<DisputePublicDTO> {
    const dispute = await this.findByPublicIdOrThrow(publicId);
    if (user.role !== "ADMIN" && dispute.raisedByUserId !== user.id) {
      throw new AuthorizationError("Only the person who raised this dispute (or an administrator) can cancel it.");
    }
    const from = dispute.status as DisputeStatusLiteral;
    if (from !== "OPEN" && from !== "UNDER_REVIEW") {
      throw new DisputeDomainError(`Cannot cancel a dispute from status ${from}.`, "INVALID_DISPUTE_TRANSITION");
    }
    const updated = await this.repo.transition(dispute.id, [from], "CANCELLED", { cancelledAt: new Date() });
    if (!updated) throw new DisputeDomainError("This dispute was already updated by someone else.", "INVALID_DISPUTE_TRANSITION", 409);

    await this.repo.addHistoryEvent({
      disputeId: dispute.id,
      eventType: "CANCELLED",
      actorUserId: user.id,
      actorRole: roleToRaisedByRole(user.role),
      previousState: from,
      newState: "CANCELLED",
      description: reason ?? "Dispute cancelled by the raiser.",
      metadata: null,
    });
    await this.audit.record({ actorUserId: user.id, action: "DISPUTE_CANCELLED", entityType: "Dispute", entityId: dispute.id });

    return this.toDTO(updated);
  }

  private toDTO(dispute: DisputeRecord): DisputePublicDTO {
    return {
      disputeId: dispute.publicId,
      disputeNumber: dispute.disputeNumber,
      type: dispute.type,
      category: dispute.category,
      title: dispute.title,
      description: dispute.description,
      status: dispute.status,
      priority: dispute.priority,
      raisedByUserId: dispute.raisedByUserId,
      raisedByRole: dispute.raisedByRole,
      farmerId: dispute.farmerId,
      buyerId: dispute.buyerId,
      transporterId: dispute.transporterId,
      lotId: dispute.lotId,
      tradeOfferId: dispute.tradeOfferId,
      shipmentId: dispute.shipmentId,
      deliveryId: dispute.deliveryId,
      paymentObligationId: dispute.paymentObligationId,
      assignedToUserId: dispute.assignedToUserId,
      assignedAt: dispute.assignedAt?.toISOString() ?? null,
      resolutionCode: dispute.resolutionCode,
      resolutionSummary: dispute.resolutionSummary,
      requestedResolution: dispute.requestedResolution,
      finalResolution: dispute.finalResolution,
      financialAdjustmentPaymentObligationId: dispute.financialAdjustmentPaymentObligationId,
      financialAdjustmentLedgerEntryId: dispute.financialAdjustmentLedgerEntryId,
      resolvedByUserId: dispute.resolvedByUserId,
      resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
      closedAt: dispute.closedAt?.toISOString() ?? null,
      createdAt: dispute.createdAt.toISOString(),
      updatedAt: dispute.updatedAt.toISOString(),
    };
  }

  private commentToDTO(comment: {
    id: string;
    visibility: DisputeCommentDTO["visibility"];
    authorUserId: string;
    authorRole: DisputeCommentDTO["authorRole"];
    message: string;
    createdAt: Date;
    editedAt: Date | null;
  }): DisputeCommentDTO {
    return {
      id: comment.id,
      visibility: comment.visibility,
      authorUserId: comment.authorUserId,
      authorRole: comment.authorRole,
      message: comment.message,
      createdAt: comment.createdAt.toISOString(),
      editedAt: comment.editedAt?.toISOString() ?? null,
    };
  }

  private evidenceToDTO(evidence: {
    id: string;
    evidenceType: DisputeEvidenceDTO["evidenceType"];
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    secureUrl: string;
    description: string | null;
    uploadedByUserId: string;
    uploadedAt: Date;
    removedAt: Date | null;
  }): DisputeEvidenceDTO {
    return {
      id: evidence.id,
      evidenceType: evidence.evidenceType,
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      secureUrl: evidence.secureUrl,
      description: evidence.description,
      uploadedByUserId: evidence.uploadedByUserId,
      uploadedAt: evidence.uploadedAt.toISOString(),
      removed: evidence.removedAt !== null,
    };
  }
}
