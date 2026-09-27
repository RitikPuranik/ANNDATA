import {
  Notification,
  NotificationCategory,
  NotificationChannel,
  NotificationDelivery,
  NotificationDeliveryStatus,
  NotificationPreference,
  NotificationPriority,
  NotificationSourceModule,
  NotificationType,
} from "@prisma/client";

/**
 * Module 22 — Notifications & Alerts.
 *
 * This file holds the shared shapes every other file in this module
 * imports from — repository rows, service-layer DTOs, and the small
 * per-NotificationType metadata contract the template layer renders
 * against. See notification.service.ts's own module doc for the overall
 * pipeline this module implements.
 */

export type NotificationRecord = Notification;
export type NotificationDeliveryRecord = NotificationDelivery;
export type NotificationPreferenceRecord = NotificationPreference;
export type NotificationWithDeliveries = NotificationRecord & { deliveries: NotificationDeliveryRecord[] };

/** What a caller (a controller, or an internal publish() call) sees back. */
export interface NotificationDTO {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  sourceModule: NotificationSourceModule;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  deliveries: NotificationDeliveryDTO[];
}

export interface NotificationDeliveryDTO {
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  attempts: number;
  deliveredAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
}

export interface NotificationPage {
  items: NotificationDTO[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export interface NotificationListFilters {
  page: number;
  limit: number;
  unreadOnly?: boolean;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  from?: Date;
  to?: Date;
  includeArchived?: boolean;
}

export interface NotificationPreferenceDTO {
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  quietHoursStartHour: number | null;
  quietHoursEndHour: number | null;
  categoryOverrides: Partial<Record<NotificationCategory, Partial<Record<NotificationChannel, boolean>>>>;
}

export interface UpdateNotificationPreferenceInput {
  whatsappEnabled?: boolean;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  quietHoursStartHour?: number | null;
  quietHoursEndHour?: number | null;
  categoryOverrides?: Partial<Record<NotificationCategory, Partial<Record<NotificationChannel, boolean>>>>;
}

/**
 * Section 15 — priority is a property of the *event type*, never left to
 * the caller to invent per call site. Section 3/15 events not listed here
 * default to NORMAL (see notification-i18n.ts's DEFAULT_PRIORITY export).
 */
export const CRITICAL_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "ACCOUNT_SECURITY_ALERT",
  "PASSWORD_CHANGED",
  "LOGIN_ALERT",
]);

export const HIGH_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "PAYMENT_FAILED",
  "SHIPMENT_DELAYED",
  "DISPUTE_RESPONSE_REQUIRED",
  "QUALITY_MISMATCH",
  "LOGISTICS_QUOTE_EXPIRED",
]);

export const LOW_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "MARKET_TREND_ALERT",
  "FORECAST_ALERT",
  "LOT_UPDATED",
]);

/** Section 3 — coarse category each NotificationType is filed under (used
 * for preference toggles and the ?category= list filter). */
export const NOTIFICATION_TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  OFFER_RECEIVED: "OFFER",
  OFFER_ACCEPTED: "OFFER",
  OFFER_REJECTED: "OFFER",
  OFFER_EXPIRED: "OFFER",

  PAYMENT_PENDING: "PAYMENT",
  PAYMENT_RECEIVED: "PAYMENT",
  PAYMENT_PARTIAL: "PAYMENT",
  PAYMENT_COMPLETED: "PAYMENT",
  PAYMENT_FAILED: "PAYMENT",

  SHIPMENT_CREATED: "SHIPMENT",
  TRANSPORTER_ASSIGNED: "SHIPMENT",
  SHIPMENT_DISPATCHED: "SHIPMENT",
  SHIPMENT_IN_TRANSIT: "SHIPMENT",
  SHIPMENT_DELAYED: "SHIPMENT",
  SHIPMENT_DELIVERED: "SHIPMENT",

  QUALITY_CHECK_COMPLETED: "QUALITY",
  QUALITY_MISMATCH: "QUALITY",
  DELIVERY_RECONCILIATION_COMPLETED: "QUALITY",

  DISPUTE_CREATED: "DISPUTE",
  DISPUTE_RESPONSE_REQUIRED: "DISPUTE",
  DISPUTE_UPDATED: "DISPUTE",
  DISPUTE_RESOLVED: "DISPUTE",
  DISPUTE_REJECTED: "DISPUTE",
  DISPUTE_REOPENED: "DISPUTE",
  DISPUTE_CLOSED: "DISPUTE",

  LOGISTICS_QUOTE_RECEIVED: "LOGISTICS",
  LOGISTICS_QUOTE_EXPIRED: "LOGISTICS",

  MARKET_PRICE_ALERT: "MARKET",
  MARKET_TREND_ALERT: "MARKET",
  FORECAST_ALERT: "FORECAST",

  LOT_CREATED: "LOT",
  LOT_UPDATED: "LOT",
  LOT_STATUS_CHANGED: "LOT",

  ACCOUNT_SECURITY_ALERT: "ACCOUNT_SECURITY",
  PASSWORD_CHANGED: "ACCOUNT_SECURITY",
  LOGIN_ALERT: "ACCOUNT_SECURITY",

  SYSTEM_ANNOUNCEMENT: "SYSTEM",
};

export function priorityForType(type: NotificationType): NotificationPriority {
  if (CRITICAL_NOTIFICATION_TYPES.has(type)) return "CRITICAL";
  if (HIGH_NOTIFICATION_TYPES.has(type)) return "HIGH";
  if (LOW_NOTIFICATION_TYPES.has(type)) return "LOW";
  return "NORMAL";
}

/** Categories whose channel preferences a user may never fully switch off
 * (Section 10/29: "do not allow users to disable mandatory security
 * notifications"). In-app is always on for every category regardless
 * (enforced in notification.service.ts, not here) — this set additionally
 * pins WhatsApp/email/SMS on for these two categories. */
export const MANDATORY_CATEGORIES: ReadonlySet<NotificationCategory> = new Set<NotificationCategory>([
  "ACCOUNT_SECURITY",
]);
