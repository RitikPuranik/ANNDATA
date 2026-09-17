/**
 * Step 10 — explicit Delivery state machine. Pure and side-effect free,
 * same convention as Module 17's shipment-state-machine.ts: the repository
 * layer performs the actual atomic DB transition (conditional updateMany),
 * this file only answers "is X -> Y ever a legal transition".
 */

export type DeliveryStatus =
  | "PENDING"
  | "RECEIVED"
  | "UNDER_INSPECTION"
  | "PARTIALLY_ACCEPTED"
  | "ACCEPTED"
  | "REJECTED"
  | "RECONCILED"
  | "CANCELLED";

const ALLOWED_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ["RECEIVED", "CANCELLED"],
  RECEIVED: ["UNDER_INSPECTION", "CANCELLED"],
  UNDER_INSPECTION: ["ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED"],
  ACCEPTED: ["RECONCILED"],
  PARTIALLY_ACCEPTED: ["RECONCILED"],
  REJECTED: ["RECONCILED"],
  RECONCILED: [],
  CANCELLED: [],
};

/** Step 20 — once a delivery reaches one of these, historical facts
 * (weighments, quality assessments, quantities) may no longer be mutated;
 * only an explicit correction/reversal workflow (not implemented here —
 * none exists yet in this codebase for any module) may revisit them. */
export const IMMUTABLE_DELIVERY_STATUSES: readonly DeliveryStatus[] = ["ACCEPTED", "REJECTED", "RECONCILED"];

export function isImmutableDeliveryStatus(status: DeliveryStatus): boolean {
  return (IMMUTABLE_DELIVERY_STATUSES as string[]).includes(status);
}

export function canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Step 3/17 — weighments and quality assessments may only be recorded
 * while a delivery is still open for inspection, never once a decision has
 * been made. */
export const INSPECTABLE_STATUSES: readonly DeliveryStatus[] = ["RECEIVED", "UNDER_INSPECTION"];

/** Step 7/16 — a reconciliation calculation may only run once the delivery
 * has actually been received and is under inspection (a weighment and a
 * quality assessment should exist, though the engine still degrades
 * gracefully — PENDING quality / no weighment yet — rather than throwing,
 * see delivery.service.ts's own comment). */
export const RECONCILABLE_STATUSES: readonly DeliveryStatus[] = ["UNDER_INSPECTION"];
