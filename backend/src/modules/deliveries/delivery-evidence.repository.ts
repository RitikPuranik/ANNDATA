import { DeliveryEvidenceType, PrismaClient } from "@prisma/client";
import { DeliveryEvidenceRecord } from "./delivery.types";

export interface CreateEvidenceData {
  deliveryId: string;
  evidenceType: DeliveryEvidenceType;
  storageProvider: string;
  externalId: string;
  secureUrl: string;
  uploadedByUserId: string | null;
}

export interface DeliveryEvidenceRepository {
  create(data: CreateEvidenceData): Promise<DeliveryEvidenceRecord>;
  listByDeliveryId(deliveryId: string): Promise<DeliveryEvidenceRecord[]>;
}

/** Step 15 — metadata/reference only, same convention as Module 5's
 * QualityImage: this codebase has no wired file-storage provider yet (see
 * QualityImage's own comment), so `storageProvider`/`externalId` stay
 * generic rather than assuming a specific vendor. No new/separate file
 * storage system is created here. */
export class PrismaDeliveryEvidenceRepository implements DeliveryEvidenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: CreateEvidenceData) {
    return this.prisma.deliveryEvidence.create({ data });
  }

  listByDeliveryId(deliveryId: string) {
    return this.prisma.deliveryEvidence.findMany({ where: { deliveryId }, orderBy: { uploadedAt: "desc" } });
  }
}
