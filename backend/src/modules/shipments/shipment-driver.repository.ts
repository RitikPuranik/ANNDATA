import { PrismaClient, VehicleDriver } from "@prisma/client";

/**
 * Step 6 — Module 15's VehicleDriver is deliberately minimal: at most one
 * driver record per vehicle (`vehicleId` is `@unique` on VehicleDriver —
 * see schema.prisma's own comment on the model). There is therefore
 * nothing to "choose" between multiple drivers for a given vehicle — Module
 * 17's assign-driver action attaches whichever single VehicleDriver record
 * (if any) already exists for the shipment's own vehicle, after
 * re-verifying it belongs to the same provider and is active.
 */
export interface ShipmentDriverRepository {
  findByVehicleId(vehicleId: string): Promise<VehicleDriver | null>;
}

export class PrismaShipmentDriverRepository implements ShipmentDriverRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByVehicleId(vehicleId: string) {
    return this.prisma.vehicleDriver.findUnique({ where: { vehicleId } });
  }
}
