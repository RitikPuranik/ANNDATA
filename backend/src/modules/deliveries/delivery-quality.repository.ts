import { DeliveryQualityResult, PrismaClient, QualityGrade } from "@prisma/client";
import { QualityParameterResult } from "./delivery-quality-reconciliation.engine";
import { DeliveryQualityAssessmentRecord } from "./delivery.types";

const INCLUDE = { observations: true } as const;

export interface CreateQualityAssessmentData {
  deliveryId: string;
  inspectorUserId: string | null;
  overallGrade: QualityGrade | null;
  overallResult: DeliveryQualityResult;
  algorithmVersion: string;
  notes: string | null;
  observations: QualityParameterResult[];
}

export interface DeliveryQualityRepository {
  create(data: CreateQualityAssessmentData): Promise<DeliveryQualityAssessmentRecord>;
  findLatestByDeliveryId(deliveryId: string): Promise<DeliveryQualityAssessmentRecord | null>;
  listByDeliveryId(deliveryId: string): Promise<DeliveryQualityAssessmentRecord[]>;
}

export class PrismaDeliveryQualityRepository implements DeliveryQualityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: CreateQualityAssessmentData) {
    return this.prisma.deliveryQualityAssessment.create({
      data: {
        deliveryId: data.deliveryId,
        inspectorUserId: data.inspectorUserId,
        overallGrade: data.overallGrade,
        overallResult: data.overallResult,
        algorithmVersion: data.algorithmVersion,
        notes: data.notes,
        observations: {
          create: data.observations
            .filter((p) => p.metricCode !== null)
            .map((p) => ({
              metricCode: p.metricCode as string,
              metricName: p.name,
              value: typeof p.actual === "number" ? p.actual : 0,
              unit: null,
              expectedMin: p.expectedMin,
              expectedMax: p.expectedMax,
              passed: p.passed,
              variance: p.variance,
            })),
        },
      },
      include: INCLUDE,
    });
  }

  findLatestByDeliveryId(deliveryId: string) {
    return this.prisma.deliveryQualityAssessment.findFirst({
      where: { deliveryId },
      orderBy: { createdAt: "desc" },
      include: INCLUDE,
    });
  }

  listByDeliveryId(deliveryId: string) {
    return this.prisma.deliveryQualityAssessment.findMany({
      where: { deliveryId },
      orderBy: { createdAt: "desc" },
      include: INCLUDE,
    });
  }
}
