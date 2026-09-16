import { LocationUpdateSource, PrismaClient } from "@prisma/client";
import { ShipmentLocationRecord } from "./shipment.types";

export interface CreateShipmentLocationData {
  shipmentId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKmh: number | null;
  headingDegrees: number | null;
  recordedAt: Date;
  source: LocationUpdateSource;
}

export interface ShipmentLocationListFilters {
  shipmentId: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export interface ShipmentLocationPage {
  items: ShipmentLocationRecord[];
  total: number;
}

export interface ShipmentLocationRepository {
  create(data: CreateShipmentLocationData): Promise<ShipmentLocationRecord>;
  /** Step 12 — the most recent location on record for a shipment, or null
   * when none has ever been received (Step 12: "Do not fabricate a
   * location when none exists"). */
  findLatest(shipmentId: string): Promise<ShipmentLocationRecord | null>;
  /** Step 11/29 — paginated, chronological, bounded (never an unlimited
   * history load). */
  list(filters: ShipmentLocationListFilters): Promise<ShipmentLocationPage>;
}

export class PrismaShipmentLocationRepository implements ShipmentLocationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: CreateShipmentLocationData) {
    return this.prisma.shipmentLocation.create({ data });
  }

  findLatest(shipmentId: string) {
    return this.prisma.shipmentLocation.findFirst({
      where: { shipmentId },
      orderBy: { recordedAt: "desc" },
    });
  }

  async list(filters: ShipmentLocationListFilters): Promise<ShipmentLocationPage> {
    const where = {
      shipmentId: filters.shipmentId,
      ...(filters.from || filters.to
        ? { recordedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.shipmentLocation.findMany({
        where,
        orderBy: { recordedAt: "asc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.shipmentLocation.count({ where }),
    ]);
    return { items, total };
  }
}
