import { apiRequest } from "@/lib/apiClient";

function unwrapList<T>(data: any, key: string): T[] {
  if (Array.isArray(data)) return data;
  if (data?.[key]) return data[key];
  if (data?.items) return data.items;
  return [];
}

export interface SubmitLocationInput {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  speedKmh?: number;
  headingDegrees?: number;
  recordedAt?: string;
  source?: "DRIVER_APP" | "GPS_DEVICE" | "IOT_DEVICE" | "ADMIN" | "SYSTEM";
}

/**
 * Physical movement of an accepted logistics quote, from creation through
 * delivery, with GPS tracking. Mirrors backend modules/shipments/*.
 */
export const shipmentApi = {
  async create(logisticsRequestId: string) {
    const data = await apiRequest<any>("/api/shipments", { method: "POST", body: { logisticsRequestId } });
    return (data?.shipment ?? data) as any;
  },

  async list(params?: { status?: string; providerId?: string; vehicleId?: string; lotId?: string }) {
    const q = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
    const qs = q.toString();
    const data = await apiRequest<any>(`/api/shipments${qs ? `?${qs}` : ""}`);
    return unwrapList<any>(data, "shipments");
  },

  async get(publicId: string) {
    const data = await apiRequest<any>(`/api/shipments/${publicId}`);
    return (data?.shipment ?? data) as any;
  },

  async handoff(publicId: string) {
    return apiRequest<any>(`/api/shipments/${publicId}/handoff`);
  },

  async confirm(publicId: string) {
    return apiRequest<any>(`/api/shipments/${publicId}/confirm`, { method: "POST" });
  },

  async assignDriver(publicId: string) {
    return apiRequest<any>(`/api/shipments/${publicId}/assign-driver`, { method: "POST" });
  },

  async readyForPickup(publicId: string) {
    return apiRequest<any>(`/api/shipments/${publicId}/ready-for-pickup`, { method: "POST" });
  },

  async pickup(publicId: string) {
    return apiRequest<any>(`/api/shipments/${publicId}/pickup`, { method: "POST" });
  },

  async startTransit(publicId: string) {
    return apiRequest<any>(`/api/shipments/${publicId}/start-transit`, { method: "POST" });
  },

  async arrive(publicId: string) {
    return apiRequest<any>(`/api/shipments/${publicId}/arrive`, { method: "POST" });
  },

  async deliver(publicId: string) {
    return apiRequest<any>(`/api/shipments/${publicId}/deliver`, { method: "POST" });
  },

  async cancel(publicId: string, reason?: string) {
    return apiRequest<any>(`/api/shipments/${publicId}/cancel`, { method: "POST", body: { reason } });
  },

  async submitLocation(publicId: string, input: SubmitLocationInput) {
    return apiRequest<any>(`/api/shipments/${publicId}/location`, { method: "POST", body: input });
  },

  async locations(publicId: string, params?: { from?: string; to?: string }) {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const qs = q.toString();
    const data = await apiRequest<any>(`/api/shipments/${publicId}/locations${qs ? `?${qs}` : ""}`);
    return unwrapList<any>(data, "locations");
  },
};
