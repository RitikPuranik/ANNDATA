import { PrismaClient, ShipmentEventType, ShipmentStatus } from "@prisma/client";
import { ShipmentEventRecord } from "./shipment.types";

export interface CreateShipmentEventData {
  shipmentId: string;
  eventType: ShipmentEventType;
  previousStatus?: ShipmentStatus | null;
  newStatus?: ShipmentStatus | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ShipmentEventRepository {
  create(data: CreateShipmentEventData): Promise<ShipmentEventRecord>;
  listByShipmentId(shipmentId: string): Promise<ShipmentEventRecord[]>;
}

/** Step 22 — append-only shipment lifecycle history, same "kept alongside
 * the row's own status, never relied on instead of it" convention as
 * LotStatusHistory. */
export class PrismaShipmentEventRepository implements ShipmentEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: CreateShipmentEventData) {
    return this.prisma.shipmentEvent.create({
      data: {
        shipmentId: data.shipmentId,
        eventType: data.eventType,
        previousStatus: data.previousStatus ?? null,
        newStatus: data.newStatus ?? null,
        actorUserId: data.actorUserId ?? null,
        metadata: data.metadata ?? undefined,
      },
    });
  }

  listByShipmentId(shipmentId: string) {
    return this.prisma.shipmentEvent.findMany({
      where: { shipmentId },
      orderBy: { createdAt: "asc" },
    });
  }
}
