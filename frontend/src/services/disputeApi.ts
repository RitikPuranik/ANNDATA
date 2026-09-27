import { apiRequest } from "@/lib/apiClient";

export type DisputeType =
  | "QUALITY_DISPUTE"
  | "QUANTITY_DISPUTE"
  | "PRICE_DISPUTE"
  | "PAYMENT_DISPUTE"
  | "DELIVERY_DISPUTE"
  | "LOGISTICS_DISPUTE"
  | "DAMAGE_DISPUTE"
  | "REJECTION_DISPUTE"
  | "DELAY_DISPUTE"
  | "OFFER_DISPUTE"
  | "WEIGHT_DISPUTE"
  | "GRIEVANCE"
  | "OTHER";

export type DisputeCategory = "TRANSACTION" | "GRIEVANCE";

export type DisputeStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "INVESTIGATION"
  | "AWAITING_PARTY_RESPONSE"
  | "RESOLUTION_PROPOSED"
  | "RESOLVED"
  | "REJECTED"
  | "CLOSED"
  | "CANCELLED";

export type DisputePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DisputeResolutionCode =
  | "NO_ACTION_REQUIRED"
  | "CLAIM_REJECTED"
  | "CLAIM_ACCEPTED"
  | "PARTIAL_CLAIM_ACCEPTED"
  | "REFUND_REQUIRED"
  | "PAYMENT_ADJUSTMENT_REQUIRED"
  | "QUANTITY_ADJUSTMENT"
  | "QUALITY_ADJUSTMENT"
  | "DELIVERY_ADJUSTMENT"
  | "LOGISTICS_ADJUSTMENT"
  | "OTHER";

/** Mirrors backend modules/disputes/dispute.types.ts's DisputePublicDTO —
 * `disputeId` here is the dispute's publicId, the only identity ever
 * exposed over the API (see that module's own doc comment). */
export interface DisputeDTO {
  disputeId: string;
  disputeNumber: string;
  type: DisputeType;
  category: DisputeCategory;
  title: string;
  description: string;
  status: DisputeStatus;
  priority: DisputePriority;
  raisedByUserId: string;
  raisedByRole: string;
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

export interface DisputeCommentDTO {
  id: string;
  visibility: "PUBLIC_COMMENT" | "INTERNAL_NOTE";
  authorUserId: string;
  authorRole: string;
  message: string;
  createdAt: string;
  editedAt: string | null;
}

export interface DisputeEvidenceDTO {
  id: string;
  evidenceType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  secureUrl: string;
  description: string | null;
  uploadedByUserId: string;
  uploadedAt: string;
  removed: boolean;
}

export interface DisputeHistoryEventDTO {
  eventType: string;
  actorUserId: string | null;
  actorRole: string | null;
  previousState: string | null;
  newState: string | null;
  description: string | null;
  createdAt: string;
}

export interface CreateDisputeInput {
  type: DisputeType;
  category?: DisputeCategory;
  title: string;
  description: string;
  priority?: DisputePriority;
  lotId?: string;
  tradeOfferId?: string;
  shipmentId?: string;
  deliveryId?: string;
  paymentObligationId?: string;
  requestedResolution?: string;
}

export interface DisputeListParams {
  status?: DisputeStatus;
  category?: DisputeCategory;
  type?: DisputeType;
  priority?: DisputePriority;
  page?: number;
  limit?: number;
}

export interface DisputePage {
  items: DisputeDTO[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Frontend client for Module 21 — Dispute & Grievance Management. Mirrors
 * backend modules/disputes/dispute.routes.ts one endpoint at a time; see
 * that file (and docs/modules/module-21-dispute-grievance-management.md)
 * for the full role/state-machine rules this only calls into.
 */
export const disputeApi = {
  async create(input: CreateDisputeInput) {
    return apiRequest<DisputeDTO>("/api/disputes", { method: "POST", body: input });
  },

  async list(params?: DisputeListParams) {
    const q = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => { if (v !== undefined && v !== "ALL") q.set(k, String(v)); });
    const qs = q.toString();
    return apiRequest<DisputePage>(`/api/disputes${qs ? `?${qs}` : ""}`);
  },

  async get(disputeId: string) {
    return apiRequest<DisputeDTO>(`/api/disputes/${disputeId}`);
  },

  async addComment(disputeId: string, message: string, internal = false) {
    return apiRequest<DisputeCommentDTO>(`/api/disputes/${disputeId}/comments`, {
      method: "POST",
      body: { message, internal },
    });
  },

  async listComments(disputeId: string) {
    return apiRequest<DisputeCommentDTO[]>(`/api/disputes/${disputeId}/comments`);
  },

  async addEvidence(
    disputeId: string,
    input: {
      evidenceType: string;
      storageProvider: string;
      externalId: string;
      secureUrl: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      description?: string;
    },
  ) {
    return apiRequest<DisputeEvidenceDTO>(`/api/disputes/${disputeId}/evidence`, { method: "POST", body: input });
  },

  async listEvidence(disputeId: string) {
    return apiRequest<DisputeEvidenceDTO[]>(`/api/disputes/${disputeId}/evidence`);
  },

  async removeEvidence(disputeId: string, evidenceId: string) {
    return apiRequest<null>(`/api/disputes/${disputeId}/evidence/${evidenceId}`, { method: "DELETE" });
  },

  async listHistory(disputeId: string) {
    return apiRequest<DisputeHistoryEventDTO[]>(`/api/disputes/${disputeId}/history`);
  },

  async assign(disputeId: string, assignedToUserId: string) {
    return apiRequest<DisputeDTO>(`/api/disputes/${disputeId}/assign`, { method: "POST", body: { assignedToUserId } });
  },

  async unassign(disputeId: string) {
    return apiRequest<DisputeDTO>(`/api/disputes/${disputeId}/unassign`, { method: "POST" });
  },

  async changeStatus(disputeId: string, status: DisputeStatus, reason?: string) {
    return apiRequest<DisputeDTO>(`/api/disputes/${disputeId}/status`, { method: "POST", body: { status, reason } });
  },

  async resolve(
    disputeId: string,
    input: {
      resolutionCode: DisputeResolutionCode;
      resolutionSummary: string;
      finalResolution: string;
      financialAdjustmentPaymentObligationId?: string;
      financialAdjustmentLedgerEntryId?: string;
    },
  ) {
    return apiRequest<DisputeDTO>(`/api/disputes/${disputeId}/resolve`, { method: "POST", body: input });
  },

  async reject(disputeId: string, resolutionSummary: string) {
    return apiRequest<DisputeDTO>(`/api/disputes/${disputeId}/reject`, { method: "POST", body: { resolutionSummary } });
  },

  async reopen(disputeId: string, reason: string) {
    return apiRequest<DisputeDTO>(`/api/disputes/${disputeId}/reopen`, { method: "POST", body: { reason } });
  },

  async close(disputeId: string) {
    return apiRequest<DisputeDTO>(`/api/disputes/${disputeId}/close`, { method: "POST", body: {} });
  },

  async cancel(disputeId: string, reason?: string) {
    return apiRequest<DisputeDTO>(`/api/disputes/${disputeId}/cancel`, { method: "POST", body: { reason } });
  },
};
