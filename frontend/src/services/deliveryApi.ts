import { apiRequest } from "@/lib/apiClient";

/**
 * Module 18 — Delivery & Quality Reconciliation client.
 *
 * The frontend previously had no client for this module at all, which is
 * part of why Module 19 (Payments) had no way to start a payment from the
 * UI: creating a payment obligation needs a delivery's id, and nothing
 * ever fetched deliveries. This file only covers what's needed to bridge
 * a shipment to its delivery/reconciliation status and on to payments —
 * it is not a full Module 18 client (weighment, quality evidence, etc.
 * are intentionally left out).
 */

export type DeliveryStatus =
  | "PENDING"
  | "RECEIVED"
  | "WEIGHED"
  | "QUALITY_CHECKED"
  | "RECONCILED"
  | "ACCEPTED"
  | "PARTIALLY_ACCEPTED"
  | "REJECTED";

export interface DeliveryPublic {
  deliveryId: string;
  deliveryNumber: string;
  shipmentId: string;
  lotId: string;
  buyerId: string;
  expectedQuantity: number;
  deliveredQuantity: number | null;
  acceptedQuantity: number | null;
  rejectedQuantity: number | null;
  quantityUnit: string;
  status: DeliveryStatus;
  reconciledAt: string | null;
}

interface Paginated<T> {
  items: T[];
  total: number;
}

export const deliveryApi = {
  /** Find the delivery record for a given shipment, if one has been created yet. */
  async findByShipment(shipmentId: string): Promise<DeliveryPublic | null> {
    const data = await apiRequest<Paginated<DeliveryPublic>>(
      `/api/deliveries?shipmentId=${encodeURIComponent(shipmentId)}&limit=1`,
    );
    return data.items[0] ?? null;
  },
};
