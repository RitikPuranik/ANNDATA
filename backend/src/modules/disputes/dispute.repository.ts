import { DisputeStatus, Prisma, PrismaClient } from "@prisma/client";
import { nextDisputeNumberCandidate } from "./dispute-number";
import {
  DisputeCommentRecord,
  DisputeEvidenceRecord,
  DisputeHistoryEventRecord,
  DisputeListFilters,
  DisputeRecord,
} from "./dispute.types";

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

export { isUniqueConstraintError };

export interface CreateDisputeData {
  type: Prisma.DisputeCreateInput["type"];
  category: Prisma.DisputeCreateInput["category"];
  title: string;
  description: string;
  priority: Prisma.DisputeCreateInput["priority"];
  raisedByUserId: string;
  raisedByRole: Prisma.DisputeCreateInput["raisedByRole"];
  farmerId: string | null;
  buyerId: string | null;
  transporterId: string | null;
  lotId: string | null;
  tradeOfferId: string | null;
  shipmentId: string | null;
  deliveryId: string | null;
  paymentObligationId: string | null;
  requestedResolution: string | null;
}

export interface DisputePage {
  items: DisputeRecord[];
  total: number;
}

export interface DisputeRepository {
  create(data: CreateDisputeData): Promise<DisputeRecord>;
  findById(id: string): Promise<DisputeRecord | null>;
  findByPublicId(publicId: string): Promise<DisputeRecord | null>;
  list(filters: DisputeListFilters): Promise<DisputePage>;
  countOpenForReference(params: {
    raisedByUserId: string;
    lotId?: string | null;
    deliveryId?: string | null;
    paymentObligationId?: string | null;
    shipmentId?: string | null;
    tradeOfferId?: string | null;
    type: string;
  }): Promise<number>;
  /** Atomic conditional transition — never create a duplicate resolution or
   * allow two racing admin actions to both succeed (Step 6/29), same
   * "conditional updateMany, null on 0 rows" pattern as
   * DeliveryRepository.transition(). */
  transition(
    id: string,
    fromStatuses: DisputeStatus[],
    toStatus: DisputeStatus,
    extraData?: Record<string, unknown>,
  ): Promise<DisputeRecord | null>;
  update(id: string, data: Record<string, unknown>): Promise<DisputeRecord>;

  addEvidence(data: Omit<DisputeEvidenceRecord, "id" | "removedAt" | "removedByUserId">): Promise<DisputeEvidenceRecord>;
  listEvidence(disputeId: string): Promise<DisputeEvidenceRecord[]>;
  findEvidenceById(id: string): Promise<DisputeEvidenceRecord | null>;
  removeEvidence(id: string, removedByUserId: string): Promise<DisputeEvidenceRecord>;

  addComment(data: Omit<DisputeCommentRecord, "id" | "editedAt" | "createdAt">): Promise<DisputeCommentRecord>;
  listComments(disputeId: string, includeInternal: boolean): Promise<DisputeCommentRecord[]>;

  addHistoryEvent(data: Omit<DisputeHistoryEventRecord, "id" | "createdAt">): Promise<DisputeHistoryEventRecord>;
  listHistory(disputeId: string): Promise<DisputeHistoryEventRecord[]>;
}

export class PrismaDisputeRepository implements DisputeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateDisputeData): Promise<DisputeRecord> {
    // Step 5/31 — human-facing reference generation, same retry-on-conflict
    // convention as PrismaDeliveryRepository.create().
    const year = new Date().getFullYear();
    const yearPrefix = `DSP-${year}-`;
    const baseSequence = (await this.prisma.dispute.count({ where: { disputeNumber: { startsWith: yearPrefix } } })) + 1;

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const disputeNumber = nextDisputeNumberCandidate(year, baseSequence, attempt);
      try {
        return await this.prisma.dispute.create({
          data: {
            disputeNumber,
            type: data.type,
            category: data.category,
            title: data.title,
            description: data.description,
            priority: data.priority,
            status: "OPEN",
            raisedByUserId: data.raisedByUserId,
            raisedByRole: data.raisedByRole,
            farmerId: data.farmerId,
            buyerId: data.buyerId,
            transporterId: data.transporterId,
            lotId: data.lotId,
            tradeOfferId: data.tradeOfferId,
            shipmentId: data.shipmentId,
            deliveryId: data.deliveryId,
            paymentObligationId: data.paymentObligationId,
            requestedResolution: data.requestedResolution,
          },
        });
      } catch (err) {
        if (isUniqueConstraintError(err) && attempt < maxAttempts - 1) continue;
        throw err;
      }
    }
    throw new Error("Failed to allocate a unique dispute number.");
  }

  findById(id: string) {
    return this.prisma.dispute.findUnique({ where: { id } });
  }

  findByPublicId(publicId: string) {
    return this.prisma.dispute.findUnique({ where: { publicId } });
  }

  /** Step 9 — duplicate-dispute protection: same raiser, same type, same
   * referenced transaction entity, still open (not RESOLVED/REJECTED/
   * CLOSED/CANCELLED). Deliberately scoped to one referenced entity at a
   * time (whichever the caller supplied) rather than an all-fields-equal
   * uniqueness constraint, so a farmer can still raise a QUANTITY_DISPUTE
   * and a QUALITY_DISPUTE against the same delivery without either
   * blocking the other. */
  async countOpenForReference(params: {
    raisedByUserId: string;
    lotId?: string | null;
    deliveryId?: string | null;
    paymentObligationId?: string | null;
    shipmentId?: string | null;
    tradeOfferId?: string | null;
    type: string;
  }): Promise<number> {
    const referenceClause: Record<string, unknown> = {};
    if (params.lotId) referenceClause.lotId = params.lotId;
    if (params.deliveryId) referenceClause.deliveryId = params.deliveryId;
    if (params.paymentObligationId) referenceClause.paymentObligationId = params.paymentObligationId;
    if (params.shipmentId) referenceClause.shipmentId = params.shipmentId;
    if (params.tradeOfferId) referenceClause.tradeOfferId = params.tradeOfferId;
    if (Object.keys(referenceClause).length === 0) return 0;

    return this.prisma.dispute.count({
      where: {
        raisedByUserId: params.raisedByUserId,
        type: params.type as never,
        status: { notIn: ["RESOLVED", "REJECTED", "CLOSED", "CANCELLED"] },
        ...referenceClause,
      },
    });
  }

  async list(filters: DisputeListFilters): Promise<DisputePage> {
    const where = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.assignedToUserId ? { assignedToUserId: filters.assignedToUserId } : {}),
      ...(filters.farmerId ? { farmerId: filters.farmerId } : {}),
      ...(filters.buyerId ? { buyerId: filters.buyerId } : {}),
      ...(filters.lotId ? { lotId: filters.lotId } : {}),
      ...(filters.tradeOfferId ? { tradeOfferId: filters.tradeOfferId } : {}),
      ...(filters.shipmentId ? { shipmentId: filters.shipmentId } : {}),
      ...(filters.deliveryId ? { deliveryId: filters.deliveryId } : {}),
      ...(filters.paymentObligationId ? { paymentObligationId: filters.paymentObligationId } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return { items, total };
  }

  async transition(
    id: string,
    fromStatuses: DisputeStatus[],
    toStatus: DisputeStatus,
    extraData: Record<string, unknown> = {},
  ): Promise<DisputeRecord | null> {
    const result = await this.prisma.dispute.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus, ...extraData },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.dispute.update({ where: { id }, data });
  }

  addEvidence(data: Omit<DisputeEvidenceRecord, "id" | "removedAt" | "removedByUserId">) {
    return this.prisma.disputeEvidence.create({
      data: {
        disputeId: data.disputeId,
        evidenceType: data.evidenceType,
        storageProvider: data.storageProvider,
        externalId: data.externalId,
        secureUrl: data.secureUrl,
        fileName: data.fileName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        checksum: data.checksum,
        description: data.description,
        uploadedByUserId: data.uploadedByUserId,
        uploadedAt: data.uploadedAt,
      },
    });
  }

  listEvidence(disputeId: string) {
    return this.prisma.disputeEvidence.findMany({ where: { disputeId }, orderBy: { uploadedAt: "asc" } });
  }

  findEvidenceById(id: string) {
    return this.prisma.disputeEvidence.findUnique({ where: { id } });
  }

  removeEvidence(id: string, removedByUserId: string) {
    return this.prisma.disputeEvidence.update({ where: { id }, data: { removedAt: new Date(), removedByUserId } });
  }

  addComment(data: Omit<DisputeCommentRecord, "id" | "editedAt" | "createdAt">) {
    return this.prisma.disputeComment.create({
      data: {
        disputeId: data.disputeId,
        visibility: data.visibility,
        authorUserId: data.authorUserId,
        authorRole: data.authorRole,
        message: data.message,
      },
    });
  }

  listComments(disputeId: string, includeInternal: boolean) {
    return this.prisma.disputeComment.findMany({
      where: { disputeId, ...(includeInternal ? {} : { visibility: "PUBLIC_COMMENT" }) },
      orderBy: { createdAt: "asc" },
    });
  }

  addHistoryEvent(data: Omit<DisputeHistoryEventRecord, "id" | "createdAt">) {
    return this.prisma.disputeHistoryEvent.create({
      data: {
        disputeId: data.disputeId,
        eventType: data.eventType,
        actorUserId: data.actorUserId,
        actorRole: data.actorRole,
        previousState: data.previousState,
        newState: data.newState,
        description: data.description,
        metadata: data.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  listHistory(disputeId: string) {
    return this.prisma.disputeHistoryEvent.findMany({ where: { disputeId }, orderBy: { createdAt: "asc" } });
  }
}
