import {
  DeliveryEvidenceType,
  DeliveryQualityResult,
  DeliveryQuantityResult,
  DeliveryStatus,
  QualityGrade,
  QuantityUnit,
  WeighingMethod,
} from "@prisma/client";

/**
 * Module 18 — Delivery & Quality Reconciliation. Raw Prisma row shapes and
 * the public DTOs mapped from them, same convention as Module 17's own
 * shipment.types.ts. publicId is the only identity ever exposed over the
 * API — internal database ids (shipmentId, lotId, tradeOfferId, buyerId)
 * never leak into a response as-is; each is resolved to its own publicId
 * before being returned.
 */

export interface DeliveryRecord {
  id: string;
  publicId: string;
  deliveryNumber: string;
  shipmentId: string;
  lotId: string;
  tradeOfferId: string | null;
  buyerId: string;
  expectedQuantityKg: unknown; // Prisma.Decimal at runtime
  deliveredQuantityKg: unknown | null;
  acceptedQuantityKg: unknown | null;
  rejectedQuantityKg: unknown | null;
  quantityUnit: QuantityUnit;
  status: DeliveryStatus;
  receivedAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  reconciledAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryWeighmentRecord {
  id: string;
  deliveryId: string;
  grossWeightKg: unknown;
  tareWeightKg: unknown;
  netWeightKg: unknown;
  weightUnit: QuantityUnit;
  weighingMethod: WeighingMethod;
  weighingTimestamp: Date;
  scaleReference: string | null;
  recordedByUserId: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface DeliveryQualityObservationRecord {
  id: string;
  assessmentId: string;
  metricCode: string;
  metricName: string;
  value: unknown;
  unit: string | null;
  expectedMin: unknown | null;
  expectedMax: unknown | null;
  passed: boolean;
  variance: unknown | null;
}

export interface DeliveryQualityAssessmentRecord {
  id: string;
  publicId: string;
  deliveryId: string;
  inspectorUserId: string | null;
  overallGrade: QualityGrade | null;
  overallResult: DeliveryQualityResult;
  algorithmVersion: string;
  assessedAt: Date;
  notes: string | null;
  createdAt: Date;
  observations: DeliveryQualityObservationRecord[];
}

export interface DeliveryReconciliationRecord {
  id: string;
  publicId: string;
  deliveryId: string;
  expectedQuantityKg: unknown;
  deliveredQuantityKg: unknown;
  acceptedQuantityKg: unknown;
  quantityVarianceKg: unknown;
  quantityTolerancePercent: unknown;
  quantityResult: DeliveryQuantityResult;
  qualityResult: DeliveryQualityResult;
  overallStatus: DeliveryStatus;
  explanation: unknown;
  algorithmVersion: string;
  calculatedAt: Date;
}

export interface DeliveryEvidenceRecord {
  id: string;
  deliveryId: string;
  evidenceType: DeliveryEvidenceType;
  storageProvider: string;
  externalId: string;
  secureUrl: string;
  uploadedByUserId: string | null;
  uploadedAt: Date;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number((value as { toString(): string }).toString());
}

function toNullableNumber(value: unknown | null): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

export { toNumber as decimalToNumber, toNullableNumber as nullableDecimalToNumber };

// ---------------------------------------------------------------------
// Public DTOs
// ---------------------------------------------------------------------

export interface DeliveryWeighmentDTO {
  grossWeight: number;
  tareWeight: number;
  netWeight: number;
  weightUnit: QuantityUnit;
  weighingMethod: WeighingMethod;
  weighingTimestamp: string;
  scaleReference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface DeliveryQualityObservationDTO {
  metricCode: string;
  metricName: string;
  value: number;
  unit: string | null;
  expected: { min: number | null; max: number | null } | null;
  passed: boolean;
  variance: number | null;
}

export interface DeliveryQualityAssessmentDTO {
  publicId: string;
  overallGrade: QualityGrade | null;
  overallResult: DeliveryQualityResult;
  assessedAt: string;
  notes: string | null;
  observations: DeliveryQualityObservationDTO[];
}

/** Step 7 explanation shape — one entry per compared quality parameter. */
export interface QualityParameterExplanation {
  name: string;
  expected: string;
  actual: number | string;
  passed: boolean;
  variance: number | null;
}

export interface DeliveryReconciliationDTO {
  publicId: string;
  expectedQuantity: number;
  deliveredQuantity: number;
  acceptedQuantity: number;
  quantityVariance: number;
  quantityTolerancePercent: number;
  quantityResult: DeliveryQuantityResult;
  qualityResult: DeliveryQualityResult;
  overallStatus: DeliveryStatus;
  explanation: {
    quantity: { expected: number; delivered: number; variance: number; tolerancePercent: number; result: DeliveryQuantityResult };
    quality: { result: DeliveryQualityResult; parameters: QualityParameterExplanation[] };
  };
  algorithmVersion: string;
  calculatedAt: string;
}

export interface DeliveryPublicDTO {
  deliveryId: string;
  deliveryNumber: string;
  shipmentId: string;
  lotId: string;
  tradeOfferId: string | null;
  buyerId: string;
  expectedQuantity: number;
  deliveredQuantity: number | null;
  acceptedQuantity: number | null;
  rejectedQuantity: number | null;
  quantityUnit: QuantityUnit;
  status: DeliveryStatus;
  receivedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  reconciledAt: string | null;
  rejectionReason: string | null;
  latestWeighment: DeliveryWeighmentDTO | null;
  latestQualityAssessment: DeliveryQualityAssessmentDTO | null;
  latestReconciliation: DeliveryReconciliationDTO | null;
  createdAt: string;
  updatedAt: string;
}

/** Step 25 — everything Module 19 (Payment Status) needs, without Module
 * 18 implementing any payment logic itself. */
export interface DeliveryHandoffDTO {
  shipmentId: string;
  tradeOfferId: string | null;
  lotId: string;
  buyerId: string;
  sellerFarmerId: string | null;
  sellerFpoId: string | null;
  expectedQuantity: number;
  deliveredQuantity: number | null;
  acceptedQuantity: number | null;
  rejectedQuantity: number | null;
  agreedCommodity: string;
  agreedQuality: { grade: QualityGrade | null; moistureMax: number | null; foreignMatterMax: number | null } | null;
  actualQuality: { grade: QualityGrade | null; result: DeliveryQualityResult } | null;
  reconciliationStatus: DeliveryStatus;
  logisticsAmount: number | null;
  logisticsCurrency: string | null;
  deliveryTimestamp: string | null;
}
