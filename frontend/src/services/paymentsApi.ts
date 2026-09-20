import { apiRequest } from "@/lib/apiClient";

/**
 * Module 19 — Payment Status Tracking client. Mirrors the backend contract in
 * backend/src/modules/payments (payment.routes.ts, payment.types.ts,
 * payment.schemas.ts). This is a payment STATUS tracker, never a gateway —
 * nothing here moves money.
 */

export type PaymentMethod = "BANK_TRANSFER" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "CASH" | "CHEQUE" | "OTHER";

export type PaymentObligationStatus =
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERPAID"
  | "OVERDUE"
  | "CANCELLED"
  | "DISPUTED";

export type PaymentRecordStatus = "RECORDED" | "CONFIRMED" | "REVERSED";

export interface PaymentRecord {
  publicId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  externalReference: string | null;
  paidAt: string;
  status: PaymentRecordStatus;
  notes: string | null;
  createdAt: string;
}

export interface PaymentObligation {
  publicId: string;
  deliveryId: string;
  tradeOfferId: string | null;
  buyerId: string;
  sellerFarmerId: string | null;
  sellerFpoId: string | null;
  currency: string;
  grossAmount: number;
  adjustments: number;
  /** The total the buyer owes — what the UI shows as "Total". */
  finalPayableAmount: number;
  amountPaid: number;
  amountDue: number;
  /** Only set once amountPaid exceeds finalPayableAmount; null otherwise. */
  excessAmount: number | null;
  status: PaymentObligationStatus;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  payments?: PaymentRecord[];
}

export interface RecordPaymentInput {
  amount: number;
  currency?: string;
  paymentMethod: PaymentMethod;
  /** Required by the backend (min 8 chars) so a retried request is never a duplicate. */
  idempotencyKey: string;
  /** UTR / cheque number only — never a card number, PIN or credential. */
  externalReference?: string;
  paidAt?: string;
  notes?: string;
}

export interface ListObligationsParams {
  status?: PaymentObligationStatus;
  deliveryId?: string;
  overdueOnly?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

interface Paginated<T> {
  items: T[];
  total: number;
}

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const paymentsApi = {
  /** Create an obligation from a RECONCILED delivery. Buyer of the delivery or ADMIN only. */
  async createObligation(deliveryId: string, dueAt?: string) {
    return apiRequest<PaymentObligation>("/api/payments/obligations", {
      method: "POST",
      body: { deliveryId, ...(dueAt ? { dueAt } : {}) },
    });
  },

  async listObligations(params: ListObligationsParams = {}) {
    return apiRequest<Paginated<PaymentObligation>>(`/api/payments/obligations${toQueryString({ ...params })}`);
  },

  async getObligation(publicId: string) {
    return apiRequest<PaymentObligation>(`/api/payments/obligations/${publicId}`);
  },

  /** Payment history for one obligation, unwrapped from the paginated envelope. */
  async listPayments(obligationPublicId: string): Promise<PaymentRecord[]> {
    const data = await apiRequest<Paginated<PaymentRecord>>(
      `/api/payments/obligations/${obligationPublicId}/payments`,
    );
    return data.items;
  },

  /** Report a payment already made outside the app. Buyer of the obligation or ADMIN only. */
  async recordPayment(obligationPublicId: string, input: RecordPaymentInput) {
    return apiRequest<PaymentObligation>(`/api/payments/obligations/${obligationPublicId}/record-payment`, {
      method: "POST",
      body: input,
    });
  },

  /** RECORDED -> CONFIRMED. Seller of the obligation or ADMIN only. */
  async confirmPayment(recordPublicId: string) {
    return apiRequest<PaymentRecord>(`/api/payments/records/${recordPublicId}/confirm`, { method: "POST" });
  },

  async markDisputed(obligationPublicId: string, reason: string) {
    return apiRequest<PaymentObligation>(`/api/payments/obligations/${obligationPublicId}/mark-disputed`, {
      method: "POST",
      body: { reason },
    });
  },

  /** ADMIN only. */
  async cancel(obligationPublicId: string, reason: string) {
    return apiRequest<PaymentObligation>(`/api/payments/obligations/${obligationPublicId}/cancel`, {
      method: "POST",
      body: { reason },
    });
  },
};
