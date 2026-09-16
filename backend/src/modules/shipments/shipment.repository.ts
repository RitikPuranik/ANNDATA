import { PrismaClient, ShipmentStatus } from "@prisma/client";
import { ShipmentRecord } from "./shipment.types";

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

/** Re-exported so the service layer can recognize a race-condition
 * duplicate shipment creation without repeating Prisma's error-shape
 * check itself (same convention as vehicle.repository.ts's own
 * isUniqueConstraintError). Step 4/28 — Shipment.logisticsRequestId and
 * Shipment.acceptedQuoteId are both @unique at the DB level, so two
 * concurrent create attempts against the same accepted quote can never
 * both succeed; the loser hits this constraint instead of a lost read/
 * write race. */
export { isUniqueConstraintError };

export interface CreateShipmentData {
  logisticsRequestId: string;
  acceptedQuoteId: string;
  lotId: string;
  transportProviderId: string;
  vehicleId: string;
  commodity: string;
  quantityKg: number;
  quantityUnit: "KG" | "QTL" | "TONNE";
  pickupAddress: string | null;
  pickupDistrict: string;
  pickupState: string;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  destinationAddress: string | null;
  destinationDistrict: string;
  destinationState: string;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  agreedAmount: number;
  currency: string;
  estimatedDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
  scheduledPickupAt: Date | null;
  estimatedDeliveryAt: Date | null;
}

export interface ShipmentListFilters {
  status?: ShipmentStatus;
  transportProviderId?: string;
  vehicleId?: string;
  lotId?: string;
  /** Step 26 — resolved server-side (never a client-supplied ownerId) to
   * whichever lot ids the caller's role is entitled to see: a farmer's own
   * lots, an FPO admin's own FPO's lots, or a buyer's accepted-offer lots.
   * Combined with `lotId` (both narrow the same column) when both are
   * present. */
  lotIds?: string[];
  page: number;
  limit: number;
}

export interface ShipmentPage {
  items: ShipmentRecord[];
  total: number;
}

export interface ShipmentRepository {
  create(data: CreateShipmentData): Promise<ShipmentRecord>;
  findById(id: string): Promise<ShipmentRecord | null>;
  findByPublicId(publicId: string): Promise<ShipmentRecord | null>;
  findByLogisticsRequestId(logisticsRequestId: string): Promise<ShipmentRecord | null>;
  findByAcceptedQuoteId(acceptedQuoteId: string): Promise<ShipmentRecord | null>;
  list(filters: ShipmentListFilters): Promise<ShipmentPage>;
  assignDriver(id: string, driverId: string): Promise<ShipmentRecord>;
  /** Atomic conditional transition — same "conditional updateMany, null on
   * 0 rows" pattern as LogisticsQuoteRepository.transition(). extraData is
   * merged into the update (e.g. actualPickupAt/actualDeliveryAt). */
  transition(
    id: string,
    fromStatuses: ShipmentStatus[],
    toStatus: ShipmentStatus,
    extraData?: Record<string, unknown>,
  ): Promise<ShipmentRecord | null>;
}

export class PrismaShipmentRepository implements ShipmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: CreateShipmentData) {
    return this.prisma.shipment.create({
      data: {
        logisticsRequestId: data.logisticsRequestId,
        acceptedQuoteId: data.acceptedQuoteId,
        lotId: data.lotId,
        transportProviderId: data.transportProviderId,
        vehicleId: data.vehicleId,
        commodity: data.commodity,
        quantityKg: data.quantityKg,
        quantityUnit: data.quantityUnit,
        pickupAddress: data.pickupAddress,
        pickupDistrict: data.pickupDistrict,
        pickupState: data.pickupState,
        pickupLatitude: data.pickupLatitude,
        pickupLongitude: data.pickupLongitude,
        destinationAddress: data.destinationAddress,
        destinationDistrict: data.destinationDistrict,
        destinationState: data.destinationState,
        destinationLatitude: data.destinationLatitude,
        destinationLongitude: data.destinationLongitude,
        agreedAmount: data.agreedAmount,
        currency: data.currency,
        estimatedDistanceKm: data.estimatedDistanceKm,
        estimatedDurationMinutes: data.estimatedDurationMinutes,
        scheduledPickupAt: data.scheduledPickupAt,
        estimatedDeliveryAt: data.estimatedDeliveryAt,
        status: "CREATED",
      },
    });
  }

  findById(id: string) {
    return this.prisma.shipment.findUnique({ where: { id } });
  }

  findByPublicId(publicId: string) {
    return this.prisma.shipment.findUnique({ where: { publicId } });
  }

  findByLogisticsRequestId(logisticsRequestId: string) {
    return this.prisma.shipment.findUnique({ where: { logisticsRequestId } });
  }

  findByAcceptedQuoteId(acceptedQuoteId: string) {
    return this.prisma.shipment.findUnique({ where: { acceptedQuoteId } });
  }

  async list(filters: ShipmentListFilters): Promise<ShipmentPage> {
    const lotIdIn = filters.lotId
      ? filters.lotIds
        ? filters.lotIds.filter((id) => id === filters.lotId)
        : [filters.lotId]
      : filters.lotIds;

    const where = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.transportProviderId ? { transportProviderId: filters.transportProviderId } : {}),
      ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
      ...(lotIdIn ? { lotId: { in: lotIdIn } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.shipment.count({ where }),
    ]);
    return { items, total };
  }

  assignDriver(id: string, driverId: string) {
    return this.prisma.shipment.update({ where: { id }, data: { driverId } });
  }

  async transition(
    id: string,
    fromStatuses: ShipmentStatus[],
    toStatus: ShipmentStatus,
    extraData: Record<string, unknown> = {},
  ): Promise<ShipmentRecord | null> {
    const result = await this.prisma.shipment.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: toStatus, ...extraData },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }
}
