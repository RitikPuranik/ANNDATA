import { apiRequest } from "@/lib/apiClient";

function unwrapList<T>(data: any, key: string): T[] {
  if (Array.isArray(data)) return data;
  if (data?.[key]) return data[key];
  if (data?.items) return data.items;
  return [];
}

export interface LogisticsLocationInput {
  address?: string;
  district: string;
  state: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
}

export interface CreateLogisticsRequestInput {
  lotId: string;
  requiredQuantityValue: number;
  requiredQuantityUnit?: "KG" | "QTL" | "TONNE";
  pickup?: Partial<LogisticsLocationInput>;
  destination: LogisticsLocationInput;
  requestedPickupAt?: string;
  deliveryDeadline?: string;
  requiredCapabilities?: string[];
  requiresRefrigeration?: boolean;
  specialInstructions?: string;
}

export interface SubmitLogisticsQuoteInput {
  vehicleId: string;
  quotedAmount: number;
  currency?: string;
  estimatedPickupTime?: string;
  estimatedDeliveryTime?: string;
  notes?: string;
  validUntil?: string;
}

/**
 * FARMER/FPO_ADMIN raise a transport requirement for a lot; TRANSPORTER
 * browses open requests and submits quotes; the requester (or ADMIN)
 * picks the best quote. Mirrors backend modules/logistics/*.
 */
export const logisticsRequestApi = {
  async create(input: CreateLogisticsRequestInput) {
    const data = await apiRequest<any>("/api/logistics/requests", { method: "POST", body: input });
    return (data?.request ?? data) as any;
  },

  async list(params?: { status?: string; cropId?: string }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.cropId) q.set("cropId", params.cropId);
    const qs = q.toString();
    const data = await apiRequest<any>(`/api/logistics/requests${qs ? `?${qs}` : ""}`);
    return unwrapList<any>(data, "requests");
  },

  async get(publicId: string) {
    const data = await apiRequest<any>(`/api/logistics/requests/${publicId}`);
    return (data?.request ?? data) as any;
  },

  async update(publicId: string, input: Partial<CreateLogisticsRequestInput>) {
    const data = await apiRequest<any>(`/api/logistics/requests/${publicId}`, { method: "PATCH", body: input });
    return (data?.request ?? data) as any;
  },

  async calculate(publicId: string) {
    return apiRequest<any>(`/api/logistics/requests/${publicId}/calculate`, { method: "POST" });
  },

  async availableProviders(publicId: string) {
    const data = await apiRequest<any>(`/api/logistics/requests/${publicId}/available-providers`);
    return unwrapList<any>(data, "providers");
  },

  async optimize(publicId: string) {
    return apiRequest<any>(`/api/logistics/requests/${publicId}/optimize`, { method: "POST" });
  },

  async cancel(publicId: string, reason?: string) {
    const data = await apiRequest<any>(`/api/logistics/requests/${publicId}/cancel`, { method: "POST", body: { reason } });
    return (data?.request ?? data) as any;
  },
};

export const logisticsQuoteApi = {
  async submit(requestPublicId: string, input: SubmitLogisticsQuoteInput) {
    const data = await apiRequest<any>(`/api/logistics/requests/${requestPublicId}/quotes`, { method: "POST", body: input });
    return (data?.quote ?? data) as any;
  },

  async listForRequest(requestPublicId: string, status?: string) {
    const qs = status ? `?status=${status}` : "";
    const data = await apiRequest<any>(`/api/logistics/requests/${requestPublicId}/quotes${qs}`);
    return unwrapList<any>(data, "quotes");
  },

  async mine(status?: string) {
    const qs = status ? `?status=${status}` : "";
    const data = await apiRequest<any>(`/api/logistics/quotes/mine${qs}`);
    return unwrapList<any>(data, "quotes");
  },

  async get(publicId: string) {
    const data = await apiRequest<any>(`/api/logistics/quotes/${publicId}`);
    return (data?.quote ?? data) as any;
  },

  async update(publicId: string, input: Partial<SubmitLogisticsQuoteInput>) {
    const data = await apiRequest<any>(`/api/logistics/quotes/${publicId}`, { method: "PATCH", body: input });
    return (data?.quote ?? data) as any;
  },

  async withdraw(publicId: string) {
    const data = await apiRequest<any>(`/api/logistics/quotes/${publicId}/withdraw`, { method: "POST" });
    return (data?.quote ?? data) as any;
  },

  async accept(publicId: string) {
    const data = await apiRequest<any>(`/api/logistics/quotes/${publicId}/accept`, { method: "POST" });
    return (data?.quote ?? data) as any;
  },

  async reject(publicId: string) {
    const data = await apiRequest<any>(`/api/logistics/quotes/${publicId}/reject`, { method: "POST" });
    return (data?.quote ?? data) as any;
  },
};
