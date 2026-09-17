import { DeliveryStatus, PrismaClient } from "@prisma/client";
import { nextDeliveryNumberCandidate } from "./delivery-number";
import { DeliveryRecord } from "./delivery.types";

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

/** Same convention as shipment.repository.ts's own re-export. */
export { isUniqueConstraintError };

export interface CreateDeliveryData {
  shipmentId: string;
  lotId: string;
  tradeOfferId: string | null;
  buyerId: string;
  expectedQuantityKg: number;
  quantityUnit: "KG" | "QTL" | "TONNE";
}

export interface DeliveryListFilters {
  status?: DeliveryStatus;
  buyerId?: string;
  lotId?: string;
  lotIds?: string[];
  shipmentId?: string;
  /** Step 26 — resolved server-side to whichever shipment ids the
   * caller's role is entitled to see (e.g. a TRANSPORTER's own hauled
   * shipments); combined with `shipmentId` (both narrow the same column)
   * when both are present, same convention as ShipmentListFilters.lotIds. */
  shipmentIds?: string[];
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export interface DeliveryPage {
  items: DeliveryRecord[];
  total: number;
}

export interface DeliveryRepository {
  create(data: CreateDeliveryData): Promise<DeliveryRecord>;
  findById(id: string): Promise<DeliveryRecord | null>;
  findByPublicId(publicId: string): Promise<DeliveryRecord | null>;
  findByShipmentId(shipmentId: string): Promise<DeliveryRecord | null>;
  list(filters: DeliveryListFilters): Promise<DeliveryPage>;
  /** Atomic conditional transition (Step 11/27: never create duplicate
   * deliveries for one shipment / never allow two racing decisions to both
   * succeed) — same "conditional updateMany, null on 0 rows" pattern as
   * ShipmentRepository.transition(). */
  transition(
    id: string,
    fromStatuses: DeliveryStatus[],
    toStatus: DeliveryStatus,
    extraData?: Record<string, unknown>,
  ): Promise<DeliveryRecord | null>;
  updateQuantities(id: string, data: { deliveredQuantityKg?: number; acceptedQuantityKg?: number; rejectedQuantityKg?: number }): Promise<DeliveryRecord>;
}

export class PrismaDeliveryRepository implements DeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateDeliveryData): Promise<DeliveryRecord> {
    // Step 1 — human-facing reference generation, same retry-on-conflict
    // convention as PrismaCropLotRepository.create() (lots.repository.ts).
    const year = new Date().getFullYear();
    const yearPrefix = `DEL-${year}-`;
    const baseSequence = (await this.prisma.delivery.count({ where: { deliveryNumber: { startsWith: yearPrefix } } })) + 1;

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const deliveryNumber = nextDeliveryNumberCandidate(year, baseSequence, attempt);
      try {
        return await this.prisma.delivery.create({
          data: {
            deliveryNumber,
            shipmentId: data.shipmentId,
            lotId: data.lotId,
            tradeOfferId: data.tradeOfferId,
            buyerId: data.buyerId,
            expectedQuantityKg: data.expectedQuantityKg,
            quantityUnit: data.quantityUnit,
            status: "PENDING",
          },
        });
      } catch (err) {
        if (isUniqueConstraintError(err) && attempt < maxAttempts - 1) continue;
        throw err;
      }
    }
    throw new Error("Failed to allocate a unique delivery number.");
  }

  findById(id: string) {
    return this.prisma.delivery.findUnique({ where: { id } });
  }

  findByPublicId(publicId: string) {
    return this.prisma.delivery.findUnique({ where: { publicId } });
  }

  findByShipmentId(shipmentId: string) {
    return this.prisma.delivery.findUnique({ where: { shipmentId } });
  }

  async list(filters: DeliveryListFilters): Promise<DeliveryPage> {
    const lotIdFilter = filters.lotId
      ? filters.lotIds
        ? { lotId: filters.lotIds.includes(filters.lotId) ? filters.lotId : "__none__" }
        : { lotId: filters.lotId }
      : filters.lotIds
        ? { lotId: { in: filters.lotIds } }
        : {};
    const shipmentIdFilter = filters.shipmentId
      ? filters.shipmentIds
        ? { shipmentId: filters.shipmentIds.includes(filters.shipmentId) ? filters.shipmentId : "__none__" }
        : { shipmentId: filters.shipmentId }
      : filters.shipmentIds
        ? { shipmentId: { in: filters.shipmentIds } }
        : {};
    const where = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.buyerId ? { buyerId: filters.buyerId } : {}),
      ...lotIdFilter,
      ...shipmentIdFilter,
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.delivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.delivery.count({ where }),
    ]);
    return { items, total };
  }

  async transition(
    id: string,
    fromStatuses: DeliveryStatus[],
    toStatus: DeliveryStatus,
    extraData: Record<string, unknown> = {},
  ): Promise<DeliveryRecord | null> {
    const result = await this.prisma.delivery.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus, ...extraData },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  updateQuantities(
    id: string,
    data: { deliveredQuantityKg?: number; acceptedQuantityKg?: number; rejectedQuantityKg?: number },
  ) {
    return this.prisma.delivery.update({ where: { id }, data });
  }
}
