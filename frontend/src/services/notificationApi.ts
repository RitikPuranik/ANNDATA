import { apiRequest } from "@/lib/apiClient";

export type NotificationCategory =
  | "OFFERS"
  | "PAYMENTS"
  | "SHIPMENTS"
  | "QUALITY_DELIVERY"
  | "DISPUTES"
  | "LOGISTICS"
  | "MARKET_FORECAST"
  | "LOTS"
  | "ACCOUNT_SECURITY"
  | "SYSTEM_ANNOUNCEMENT";

export type NotificationPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type NotificationChannel = "IN_APP" | "WHATSAPP" | "EMAIL" | "SMS";
export type NotificationDeliveryStatus = "PENDING" | "PROCESSING" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED";

export interface NotificationDeliveryDTO {
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  attempts: number;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
}

/** Mirrors backend modules/notifications/notification.types.ts's
 * NotificationDTO — `id` here is the notification's publicId. */
export interface NotificationDTO {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  sourceModule: string;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  deliveries: NotificationDeliveryDTO[];
}

export interface NotificationPage {
  items: NotificationDTO[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export interface NotificationListParams {
  unreadOnly?: boolean;
  includeArchived?: boolean;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  page?: number;
  limit?: number;
}

export interface NotificationPreferenceDTO {
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  quietHoursStartHour: number | null;
  quietHoursEndHour: number | null;
  categoryOverrides: Partial<Record<NotificationCategory, Partial<Record<NotificationChannel, boolean>>>>;
}

/**
 * Frontend client for Module 22 — Notifications & Alerts. Mirrors backend
 * modules/notifications/notification.routes.ts. Every route is implicitly
 * scoped to the authenticated caller server-side — there is no way to
 * pass another user's id here (see that module's own doc comment).
 */
export const notificationApi = {
  async list(params?: NotificationListParams) {
    const q = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([k, v]) => { if (v !== undefined) q.set(k, String(v)); });
    const qs = q.toString();
    return apiRequest<NotificationPage>(`/api/notifications${qs ? `?${qs}` : ""}`);
  },

  async unreadCount() {
    const data = await apiRequest<{ count: number }>("/api/notifications/unread-count");
    return data.count;
  },

  async get(publicId: string) {
    return apiRequest<NotificationDTO>(`/api/notifications/${publicId}`);
  },

  async markRead(publicId: string) {
    return apiRequest<NotificationDTO>(`/api/notifications/${publicId}/read`, { method: "POST" });
  },

  async markAllRead() {
    const data = await apiRequest<{ count: number }>("/api/notifications/read-all", { method: "POST" });
    return data.count;
  },

  async archive(publicId: string) {
    return apiRequest<null>(`/api/notifications/${publicId}/archive`, { method: "POST" });
  },

  async getPreferences() {
    return apiRequest<NotificationPreferenceDTO>("/api/notifications/preferences");
  },

  async updatePreferences(input: Partial<NotificationPreferenceDTO>) {
    return apiRequest<NotificationPreferenceDTO>("/api/notifications/preferences", { method: "PATCH", body: input });
  },

  async createAnnouncement(input: {
    title: string;
    body: string;
    priority?: NotificationPriority;
    audienceRole?: string | null;
    scheduledFor?: string;
  }) {
    return apiRequest<NotificationDTO>("/api/notifications/announcements", { method: "POST", body: input });
  },
};
