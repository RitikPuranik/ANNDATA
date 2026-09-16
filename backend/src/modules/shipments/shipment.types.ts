import { LocationUpdateSource, QuantityUnit, ShipmentEventType, ShipmentStatus } from "@prisma/client";

/**
 * Module 17 — Shipment & GPS Tracking. Raw Prisma row shapes and the
 * public DTOs mapped from them, same convention as Module 16's own
 * logistics.types.ts. publicId is the only identity ever exposed over the
 * API — internal database ids (lotId, transportProviderId, vehicleId,
 * driverId, logisticsRequestId, acceptedQuoteId) never leak into a
 * response as-is; every one of them is resolved to its own publicId
 * before being returned.
 */

export interface ShipmentRecord {
  id: string;
  publicId: string;
  logisticsRequestId: string;
  acceptedQuoteId: string;
  lotId: string;
  transportProviderId: string;
  vehicleId: string;
  driverId: string | null;
  commodity: string;
  quantityKg: unknown; // Prisma.Decimal at runtime
  quantityUnit: QuantityUnit;
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
  agreedAmount: unknown; // Prisma.Decimal at runtime
  currency: string;
  estimatedDistanceKm: unknown | null;
  estimatedDurationMinutes: number | null;
  scheduledPickupAt: Date | null;
  estimatedDeliveryAt: Date | null;
  actualPickupAt: Date | null;
  actualDeliveryAt: Date | null;
  status: ShipmentStatus;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShipmentLocationRecord {
  id: string;
  shipmentId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKmh: number | null;
  headingDegrees: number | null;
  recordedAt: Date;
  source: LocationUpdateSource;
  createdAt: Date;
}

export interface ShipmentEventRecord {
  id: string;
  shipmentId: string;
  eventType: ShipmentEventType;
  previousStatus: ShipmentStatus | null;
  newStatus: ShipmentStatus | null;
  actorUserId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface LatestLocationDTO {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKmh: number | null;
  headingDegrees: number | null;
  recordedAt: string;
  source: LocationUpdateSource;
}

/** Step 16 — an ETA is either the never-recalculated initial figure Module
 * 16 handed off, or a later recalculation once enough route/location data
 * exists. Never presented as guaranteed (Step 16: "Do not present an
 * estimate as guaranteed"). */
export interface ShipmentEtaDTO {
  type: "INITIAL_ESTIMATE" | "RECALCULATED_ESTIMATE";
  estimatedDeliveryAt: string | null;
  estimatedDurationMinutes: number | null;
}

/** Step 17 — nullable whenever insufficient data exists; distances are
 * clearly marked as straight-line ("HAVERSINE") when no road-distance
 * figure is available, rather than silently presented as road distance. */
export interface ShipmentRouteProgressDTO {
  pickup: { latitude: number | null; longitude: number | null };
  destination: { latitude: number | null; longitude: number | null };
  latestLocation: LatestLocationDTO | null;
  estimatedDistanceKm: number | null;
  estimatedDistanceType: "ROUTE_ESTIMATE" | null;
  elapsedDistanceKm: number | null;
  elapsedDistanceType: "HAVERSINE" | null;
  progressPercent: number | null;
}

export interface ShipmentPublicDTO {
  shipmentId: string;
  logisticsRequestId: string;
  acceptedQuoteId: string;
  lotId: string;
  transportProviderId: string;
  vehicleId: string;
  driverId: string | null;
  commodity: string;
  quantity: number;
  quantityUnit: QuantityUnit;
  pickup: {
    address: string | null;
    district: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
  };
  destination: {
    address: string | null;
    district: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
  };
  agreedAmount: number;
  currency: string;
  scheduledPickupAt: string | null;
  actualPickupAt: string | null;
  actualDeliveryAt: string | null;
  status: ShipmentStatus;
  cancelledAt: string | null;
  cancelReason: string | null;
  eta: ShipmentEtaDTO;
  latestLocation: LatestLocationDTO | null;
  routeProgress: ShipmentRouteProgressDTO;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentLocationPublicDTO {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKmh: number | null;
  headingDegrees: number | null;
  recordedAt: string;
  source: LocationUpdateSource;
}

/** Step 33 — everything Module 18 (Delivery & Quality Reconciliation)
 * needs, without Module 17 implementing any grading/reconciliation
 * itself. */
export interface ShipmentHandoffDTO {
  shipmentId: string;
  lotId: string;
  deliveredQuantity: number | null;
  expectedQuantity: number;
  quantityUnit: QuantityUnit;
  pickupAt: string | null;
  deliveryAt: string | null;
  transportProviderId: string;
  vehicleId: string;
  acceptedQuoteId: string;
  agreedAmount: number;
  currency: string;
  deliveryStatus: ShipmentStatus;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number((value as { toString(): string }).toString());
}

function toNullableNumber(value: unknown | null): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

export { toNumber as decimalToNumber, toNullableNumber as nullableDecimalToNumber };
