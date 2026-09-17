import { PrismaClient, WeighingMethod } from "@prisma/client";
import { DeliveryWeighmentRecord } from "./delivery.types";

export interface CreateWeighmentData {
  deliveryId: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number;
  weightUnit: "KG" | "QTL" | "TONNE";
  weighingMethod: WeighingMethod;
  weighingTimestamp: Date;
  scaleReference: string | null;
  recordedByUserId: string | null;
  notes: string | null;
}

export interface DeliveryWeighmentRepository {
  create(data: CreateWeighmentData): Promise<DeliveryWeighmentRecord>;
  findLatestByDeliveryId(deliveryId: string): Promise<DeliveryWeighmentRecord | null>;
  listByDeliveryId(deliveryId: string): Promise<DeliveryWeighmentRecord[]>;
}

export class PrismaDeliveryWeighmentRepository implements DeliveryWeighmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: CreateWeighmentData) {
    return this.prisma.deliveryWeighment.create({ data });
  }

  findLatestByDeliveryId(deliveryId: string) {
    return this.prisma.deliveryWeighment.findFirst({ where: { deliveryId }, orderBy: { createdAt: "desc" } });
  }

  listByDeliveryId(deliveryId: string) {
    return this.prisma.deliveryWeighment.findMany({ where: { deliveryId }, orderBy: { createdAt: "desc" } });
  }
}
