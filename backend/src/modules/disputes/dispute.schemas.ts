import { z } from "zod";

const publicId = z.string().uuid("This value is not valid.");

const disputeType = z.enum([
  "QUALITY_DISPUTE",
  "QUANTITY_DISPUTE",
  "PRICE_DISPUTE",
  "PAYMENT_DISPUTE",
  "DELIVERY_DISPUTE",
  "LOGISTICS_DISPUTE",
  "DAMAGE_DISPUTE",
  "REJECTION_DISPUTE",
  "DELAY_DISPUTE",
  "OFFER_DISPUTE",
  "WEIGHT_DISPUTE",
  "GRIEVANCE",
  "OTHER",
]);

const disputeStatus = z.enum([
  "OPEN",
  "UNDER_REVIEW",
  "INVESTIGATION",
  "AWAITING_PARTY_RESPONSE",
  "RESOLUTION_PROPOSED",
  "RESOLVED",
  "REJECTED",
  "CLOSED",
  "CANCELLED",
]);

const disputePriority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const disputeCategory = z.enum(["TRANSACTION", "GRIEVANCE"]);
const disputeResolutionCode = z.enum([
  "NO_ACTION_REQUIRED",
  "CLAIM_REJECTED",
  "CLAIM_ACCEPTED",
  "PARTIAL_CLAIM_ACCEPTED",
  "REFUND_REQUIRED",
  "PAYMENT_ADJUSTMENT_REQUIRED",
  "QUANTITY_ADJUSTMENT",
  "QUALITY_ADJUSTMENT",
  "DELIVERY_ADJUSTMENT",
  "LOGISTICS_ADJUSTMENT",
  "OTHER",
]);
const evidenceType = z.enum([
  "IMAGE",
  "DOCUMENT",
  "DELIVERY_PROOF",
  "QUALITY_REPORT",
  "WEIGHING_RECORD",
  "PAYMENT_REFERENCE",
  "SHIPMENT_INFORMATION",
  "OTHER",
]);

export const disputePublicIdParams = z.object({ publicId }).strict();
export const disputeEvidenceParams = z.object({ publicId, evidenceId: z.string().uuid() }).strict();

/** Step 8 — at least one of a transaction reference or an explicit
 * GRIEVANCE category must be present; a TRANSACTION-category dispute with
 * no reference at all is rejected server-side (dispute.service.ts), not
 * just here, since a client could omit `category` and still supply no
 * reference. */
export const createDisputeBody = z
  .object({
    type: disputeType,
    category: disputeCategory.default("TRANSACTION"),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(5000),
    priority: disputePriority.optional(),
    lotId: publicId.optional(),
    tradeOfferId: publicId.optional(),
    shipmentId: publicId.optional(),
    deliveryId: publicId.optional(),
    paymentObligationId: publicId.optional(),
    requestedResolution: z.string().trim().max(2000).optional(),
    evidence: z
      .array(
        z.object({
          evidenceType,
          storageProvider: z.string().trim().min(1).max(60),
          externalId: z.string().trim().min(1).max(300),
          secureUrl: z.string().trim().url().max(2000),
          fileName: z.string().trim().min(1).max(255),
          mimeType: z.string().trim().min(1).max(120),
          sizeBytes: z.coerce.number().int().positive().max(50 * 1024 * 1024),
          checksum: z.string().trim().max(128).optional(),
          description: z.string().trim().max(500).optional(),
        }),
      )
      .max(10)
      .default([]),
  })
  .strict();

export const addCommentBody = z
  .object({
    message: z.string().trim().min(1).max(3000),
    /** Only an ADMIN caller may set INTERNAL_NOTE; the service layer
     * enforces this and silently rejects the attempt for any other role
     * rather than trusting the flag from the client (Step 12). */
    internal: z.boolean().default(false),
  })
  .strict();

export const addEvidenceBody = z
  .object({
    evidenceType,
    storageProvider: z.string().trim().min(1).max(60),
    externalId: z.string().trim().min(1).max(300),
    secureUrl: z.string().trim().url().max(2000),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(120),
    sizeBytes: z.coerce.number().int().positive().max(50 * 1024 * 1024),
    checksum: z.string().trim().max(128).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const assignDisputeBody = z
  .object({
    assignedToUserId: z.string().uuid(),
  })
  .strict();

export const changeStatusBody = z
  .object({
    status: disputeStatus,
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export const resolveDisputeBody = z
  .object({
    resolutionCode: disputeResolutionCode,
    resolutionSummary: z.string().trim().min(10).max(3000),
    finalResolution: z.string().trim().min(3).max(3000),
    /** Step 16 — a reference to a financial record ALREADY created through
     * Module 19/20; never a raw amount the dispute module would act on
     * itself. */
    financialAdjustmentPaymentObligationId: publicId.optional(),
    financialAdjustmentLedgerEntryId: publicId.optional(),
  })
  .strict();

export const rejectDisputeBody = z
  .object({
    resolutionSummary: z.string().trim().min(10).max(3000),
  })
  .strict();

export const reopenDisputeBody = z
  .object({
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();

export const closeDisputeBody = z.object({}).strict();
export const cancelDisputeBody = z
  .object({
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export const listDisputesQuery = z
  .object({
    status: disputeStatus.optional(),
    category: disputeCategory.optional(),
    type: disputeType.optional(),
    priority: disputePriority.optional(),
    assignedToUserId: z.string().uuid().optional(),
    farmerId: publicId.optional(),
    buyerId: publicId.optional(),
    lotId: publicId.optional(),
    tradeOfferId: publicId.optional(),
    shipmentId: publicId.optional(),
    deliveryId: publicId.optional(),
    paymentObligationId: publicId.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict()
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: "`from` must be on or before `to`.",
    path: ["to"],
  });
