import { DeliveryQualityResult, DeliveryQuantityResult, DeliveryStatus, PrismaClient } from "@prisma/client";
import { DeliveryReconciliationRecord } from "./delivery.types";

export interface CreateReconciliationData {
  deliveryId: string;
  expectedQuantityKg: number;
  deliveredQuantityKg: number;
  acceptedQuantityKg: number;
  quantityVarianceKg: number;
  quantityTolerancePercent: number;
  quantityResult: DeliveryQuantityResult;
  qualityResult: DeliveryQualityResult;
  overallStatus: DeliveryStatus;
  explanation: unknown;
  algorithmVersion: string;
}

export interface DeliveryReconciliationRepository {
  /** Step 16 — one immutable row per calculation run, never overwritten
   * (same "append, don't mutate" convention as
   * LogisticsOptimizationResult). */
  create(data: CreateReconciliationData): Promise<DeliveryReconciliationRecord>;
  findLatestByDeliveryId(deliveryId: string): Promise<DeliveryReconciliationRecord | null>;
  listByDeliveryId(deliveryId: string): Promise<DeliveryReconciliationRecord[]>;
}

export class PrismaDeliveryReconciliationRepository implements DeliveryReconciliationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: CreateReconciliationData) {
    return this.prisma.deliveryReconciliation.create({
      data: {
        deliveryId: data.deliveryId,
        expectedQuantityKg: data.expectedQuantityKg,
        deliveredQuantityKg: data.deliveredQuantityKg,
        acceptedQuantityKg: data.acceptedQuantityKg,
        quantityVarianceKg: data.quantityVarianceKg,
        quantityTolerancePercent: data.quantityTolerancePercent,
        quantityResult: data.quantityResult,
        qualityResult: data.qualityResult,
        overallStatus: data.overallStatus,
        explanation: data.explanation as never,
        algorithmVersion: data.algorithmVersion,
      },
    });
  }

  findLatestByDeliveryId(deliveryId: string) {
    return this.prisma.deliveryReconciliation.findFirst({ where: { deliveryId }, orderBy: { calculatedAt: "desc" } });
  }

  listByDeliveryId(deliveryId: string) {
    return this.prisma.deliveryReconciliation.findMany({ where: { deliveryId }, orderBy: { calculatedAt: "desc" } });
  }
}
