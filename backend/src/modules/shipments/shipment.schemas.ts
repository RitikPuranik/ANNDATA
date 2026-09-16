import { z } from "zod";

const publicId = z.string().uuid("This value is not valid.");
const locationUpdateSource = z.enum(["DRIVER_APP", "GPS_DEVICE", "IOT_DEVICE", "ADMIN", "SYSTEM"]);
const shipmentStatus = z.enum([
  "CREATED",
  "CONFIRMED",
  "ASSIGNED",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED",
  "DELIVERED",
  "CANCELLED",
]);

export const shipmentPublicIdParams = z.object({ publicId }).strict();
export const logisticsRequestPublicIdParams = z.object({ publicId }).strict();

/** Step 4 — the only thing ever accepted from the client to create a
 * shipment is a reference to the already-accepted Module 16 quote; every
 * other field (provider, vehicle, price, farmer, buyer, quantity) is
 * server-derived from that quote/request, never from the body (Step 4). */
export const createShipmentBody = z
  .object({
    logisticsRequestId: publicId,
  })
  .strict();

export const assignDriverBody = z.object({}).strict();

export const cancelShipmentBody = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

/** Step 10/14 — reject clearly invalid GPS data outright rather than
 * silently clamping it (Step 14: "Do not silently modify malformed
 * coordinates"). */
export const submitLocationBody = z
  .object({
    latitude: z.coerce.number().finite().min(-90).max(90),
    longitude: z.coerce.number().finite().min(-180).max(180),
    accuracyMeters: z.coerce.number().finite().min(0).optional(),
    speedKmh: z.coerce.number().finite().min(0).optional(),
    headingDegrees: z.coerce.number().finite().min(0).lt(360).optional(),
    recordedAt: z.coerce.date().optional(),
    source: locationUpdateSource.default("DRIVER_APP"),
  })
  .strict();

export const listShipmentsQuery = z
  .object({
    status: shipmentStatus.optional(),
    providerId: publicId.optional(),
    vehicleId: publicId.optional(),
    lotId: publicId.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export const listLocationsQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
  })
  .strict()
  .refine((data) => !data.from || !data.to || data.from <= data.to, {
    message: "`from` must be on or before `to`.",
    path: ["to"],
  });
