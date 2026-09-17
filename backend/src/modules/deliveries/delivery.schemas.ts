import { z } from "zod";

const publicId = z.string().uuid("This value is not valid.");
const deliveryStatus = z.enum([
  "PENDING",
  "RECEIVED",
  "UNDER_INSPECTION",
  "PARTIALLY_ACCEPTED",
  "ACCEPTED",
  "REJECTED",
  "RECONCILED",
  "CANCELLED",
]);
const weighingMethod = z.enum(["WEIGHBRIDGE", "ELECTRONIC_SCALE", "MANUAL", "OTHER"]);
const evidenceType = z.enum([
  "WEIGHMENT_SLIP",
  "DELIVERY_RECEIPT",
  "QUALITY_CERTIFICATE",
  "INSPECTION_DOCUMENT",
  "PHOTOGRAPH",
  "OTHER",
]);
const qualityGrade = z.enum(["A", "B", "C", "D", "REJECTED"]);

export const deliveryPublicIdParams = z.object({ publicId }).strict();

/** Step 11 — the only client input to create a delivery is a reference to
 * the already-completed shipment; every other field (lot, buyer, expected
 * quantity, agreed quality) is server-derived, never from the body. */
export const createDeliveryBody = z
  .object({
    shipmentId: publicId,
  })
  .strict();

/** Step 14 — an optional manually-recorded quantity, only ever used when
 * no weighment exists yet (source-of-truth hierarchy: verified weighment >
 * authorized delivery quantity > manual figure — see delivery.service.ts). */
export const receiveDeliveryBody = z
  .object({
    manuallyRecordedQuantityKg: z.coerce.number().positive().optional(),
    receivedAt: z.coerce.date().optional(),
  })
  .strict();

/** Step 3 — net weight is never accepted from the client; only gross/tare
 * are, and the server always recomputes net = gross - tare. */
export const recordWeighmentBody = z
  .object({
    grossWeightKg: z.coerce.number().min(0),
    tareWeightKg: z.coerce.number().min(0),
    weightUnit: z.enum(["KG", "QTL", "TONNE"]).default("KG"),
    weighingMethod: weighingMethod.default("WEIGHBRIDGE"),
    weighingTimestamp: z.coerce.date().optional(),
    scaleReference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((data) => data.grossWeightKg >= data.tareWeightKg, {
    message: "Gross weight must be greater than or equal to tare weight.",
    path: ["grossWeightKg"],
  });

const qualityObservationInput = z
  .object({
    metricCode: z.string().trim().min(1).max(60),
    metricName: z.string().trim().min(1).max(120),
    value: z.coerce.number(),
    unit: z.string().trim().max(30).optional(),
  })
  .strict();

/** Step 4/5 — observed values only; the agreed thresholds they are judged
 * against are always resolved server-side (delivery-quality-agreement.resolver.ts),
 * never accepted from the client (Step 6). */
export const recordQualityAssessmentBody = z
  .object({
    overallGrade: qualityGrade.optional(),
    observations: z.array(qualityObservationInput).max(50).default([]),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const reconcileDeliveryBody = z.object({}).strict();

export const acceptDeliveryBody = z
  .object({
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const rejectDeliveryBody = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const partialAcceptDeliveryBody = z
  .object({
    acceptedQuantityKg: z.coerce.number().positive(),
    rejectionReason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();

export const addEvidenceBody = z
  .object({
    evidenceType,
    storageProvider: z.string().trim().min(1).max(60),
    externalId: z.string().trim().min(1).max(300),
    secureUrl: z.string().trim().url().max(2000),
  })
  .strict();

export const listDeliveriesQuery = z
  .object({
    status: deliveryStatus.optional(),
    buyerId: publicId.optional(),
    lotId: publicId.optional(),
    shipmentId: publicId.optional(),
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
