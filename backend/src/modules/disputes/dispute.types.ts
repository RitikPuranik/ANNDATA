import {
  DisputeCategory,
  DisputeCommentVisibility,
  DisputeEvidenceType,
  DisputeHistoryEventType,
  DisputePriority,
  DisputeRaisedByRole,
  DisputeResolutionCode,
  DisputeStatus,
  DisputeType,
} from "@prisma/client";

/**
 * Module 21 — Dispute & Grievance Management. Raw Prisma row shapes and the
 * public DTOs mapped from them, same convention as deliveries/delivery.types.ts.
 * publicId is the only dispute identity ever exposed over the API; internal
 * database ids of referenced entities (lotId, tradeOfferId, shipmentId,
 * deliveryId, paymentObligationId, farmerId, buyerId, transporterId) never
 * leak into a response as-is — see dispute.service.ts's own DTO mapper for
 * how each is resolved to its own publicId/reference before being returned.
 */

export interface DisputeRecord {
  id: string;
  publicId: string;
  disputeNumber: string;
  type: DisputeType;
  category: DisputeCategory;
  title: string;
  description: string;
  status: DisputeStatus;
  priority: DisputePriority;
  raisedByUserId: string;
  raisedByRole: DisputeRaisedByRole;
  farmerId: string | null;
  buyerId: string | null;
  transporterId: string | null;
  lotId: string | null;
  tradeOfferId: string | null;
  shipmentId: string | null;
  deliveryId: string | null;
  paymentObligationId: string | null;
  ledgerEntryId: string | null;
  assignedToUserId: string | null;
  assignedAt: Date | null;
  assignedByUserId: string | null;
  resolutionCode: DisputeResolutionCode | null;
  resolutionSummary: string | null;
  requestedResolution: string | null;
  finalResolution: string | null;
  financialAdjustmentPaymentObligationId: string | null;
  financialAdjustmentLedgerEntryId: string | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisputeEvidenceRecord {
  id: string;
  disputeId: string;
  evidenceType: DisputeEvidenceType;
  storageProvider: string;
  externalId: string;
  secureUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  description: string | null;
  uploadedByUserId: string;
  uploadedAt: Date;
  removedAt: Date | null;
  removedByUserId: string | null;
}

export interface DisputeCommentRecord {
  id: string;
  disputeId: string;
  visibility: DisputeCommentVisibility;
  authorUserId: string;
  authorRole: DisputeRaisedByRole;
  message: string;
  createdAt: Date;
  editedAt: Date | null;
}

export interface DisputeHistoryEventRecord {
  id: string;
  disputeId: string;
  eventType: DisputeHistoryEventType;
  actorUserId: string | null;
  actorRole: DisputeRaisedByRole | null;
  previousState: string | null;
  newState: string | null;
  description: string | null;
  metadata: unknown;
  createdAt: Date;
}

// ---------------------------------------------------------------------
// Reference entity used to resolve/validate ownership at creation time
// (Step 8/22 — never trust a client-supplied ownership claim).
// ---------------------------------------------------------------------
export interface DisputeReferenceInput {
  lotId?: string;
  tradeOfferId?: string;
  shipmentId?: string;
  deliveryId?: string;
  paymentObligationId?: string;
}

// ---------------------------------------------------------------------
// Public DTOs
// ---------------------------------------------------------------------

export interface DisputeEvidenceDTO {
  id: string;
  evidenceType: DisputeEvidenceType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  secureUrl: string;
  description: string | null;
  uploadedByUserId: string;
  uploadedAt: string;
  removed: boolean;
}

export interface DisputeCommentDTO {
  id: string;
  visibility: DisputeCommentVisibility;
  authorUserId: string;
  authorRole: DisputeRaisedByRole;
  message: string;
  createdAt: string;
  editedAt: string | null;
}

export interface DisputeHistoryEventDTO {
  eventType: DisputeHistoryEventType;
  actorUserId: string | null;
  actorRole: DisputeRaisedByRole | null;
  previousState: string | null;
  newState: string | null;
  description: string | null;
  createdAt: string;
}

export interface DisputePublicDTO {
  disputeId: string;
  disputeNumber: string;
  type: DisputeType;
  category: DisputeCategory;
  title: string;
  description: string;
  status: DisputeStatus;
  priority: DisputePriority;
  raisedByUserId: string;
  raisedByRole: DisputeRaisedByRole;
  farmerId: string | null;
  buyerId: string | null;
  transporterId: string | null;
  lotId: string | null;
  tradeOfferId: string | null;
  shipmentId: string | null;
  deliveryId: string | null;
  paymentObligationId: string | null;
  assignedToUserId: string | null;
  assignedAt: string | null;
  resolutionCode: DisputeResolutionCode | null;
  resolutionSummary: string | null;
  requestedResolution: string | null;
  finalResolution: string | null;
  financialAdjustmentPaymentObligationId: string | null;
  financialAdjustmentLedgerEntryId: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeListFilters {
  status?: DisputeStatus;
  category?: DisputeCategory;
  type?: DisputeType;
  priority?: DisputePriority;
  assignedToUserId?: string;
  farmerId?: string;
  buyerId?: string;
  lotId?: string;
  tradeOfferId?: string;
  shipmentId?: string;
  deliveryId?: string;
  paymentObligationId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}
