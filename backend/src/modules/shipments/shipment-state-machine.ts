/**
 * Step 3 — explicit Shipment state machine. Pure and side-effect free:
 * the repository layer performs the actual atomic DB transition
 * (conditional updateMany, same pattern as
 * PrismaLogisticsQuoteRepository.transition() — see shipment.repository.ts),
 * this file only answers "is X -> Y ever a legal transition".
 */

export type ShipmentStatus =
  | "CREATED"
  | "CONFIRMED"
  | "ASSIGNED"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "DELIVERED"
  | "CANCELLED";

// Module 15's own VehicleDriver record is optional foundation-only schema
// (at most one driver row per vehicle, and only if the provider ever
// created one — see shipment-driver.repository.ts's own comment), so
// ASSIGNED (driver attached) can never be a mandatory gate between
// CONFIRMED and READY_FOR_PICKUP for every shipment. Assigning a driver
// while CONFIRMED advances the state to ASSIGNED as a side effect (see
// ShipmentService.assignDriver); a shipment with no driver record simply
// proceeds CONFIRMED -> READY_FOR_PICKUP directly.
const ALLOWED_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  CREATED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["ASSIGNED", "READY_FOR_PICKUP", "CANCELLED"],
  ASSIGNED: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT"],
  IN_TRANSIT: ["ARRIVED", "DELIVERED"],
  ARRIVED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export const TERMINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ["DELIVERED", "CANCELLED"];

export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
  return (TERMINAL_SHIPMENT_STATUSES as string[]).includes(status);
}

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Step 27 — cancellation is only ever legal before the shipment has
 * actually been picked up; once PICKED_UP/IN_TRANSIT/ARRIVED, a shipment
 * must run its course to DELIVERED rather than vanish mid-trip. */
export const CANCELLABLE_FROM_STATUSES: readonly ShipmentStatus[] = [
  "CREATED",
  "CONFIRMED",
  "ASSIGNED",
  "READY_FOR_PICKUP",
];

/** Step 10/14 — a shipment may only ever receive GPS updates while it is
 * an active, in-progress trip; never before pickup, never once it has
 * reached a terminal state. */
export const LOCATION_UPDATABLE_STATUSES: readonly ShipmentStatus[] = [
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED",
];
