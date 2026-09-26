import { z } from "zod";

const publicId = z.string().uuid("This value is not valid.");

const notificationCategory = z.enum([
  "OFFER",
  "PAYMENT",
  "SHIPMENT",
  "QUALITY",
  "DISPUTE",
  "LOGISTICS",
  "MARKET",
  "FORECAST",
  "SELL_STORE",
  "LOT",
  "ACCOUNT_SECURITY",
  "SYSTEM",
]);

const notificationPriority = z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const notificationChannel = z.enum(["IN_APP", "WHATSAPP", "EMAIL", "SMS"]);

export const notificationListQuerySchema = z
  .object({
    unreadOnly: z.coerce.boolean().optional(),
    includeArchived: z.coerce.boolean().optional(),
    category: notificationCategory.optional(),
    priority: notificationPriority.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export const notificationParamsSchema = z
  .object({
    publicId,
  })
  .strict();

// Section 10 — categoryOverrides is a nested map keyed by category then
// channel; validated fully here (unknown categories/channels rejected at
// the transport boundary) as well as again in
// NotificationPreferenceService (Section 49: never trust unvalidated
// client input past the boundary that first receives it, but also never
// rely on only one layer having checked).
export const updateNotificationPreferenceSchema = z
  .object({
    whatsappEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    quietHoursStartHour: z.number().int().min(0).max(23).nullable().optional(),
    quietHoursEndHour: z.number().int().min(0).max(23).nullable().optional(),
    categoryOverrides: z.record(notificationCategory, z.record(notificationChannel, z.boolean())).optional(),
  })
  .strict();

// Section 44 — admin-authored system announcements.
export const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(2000),
    priority: notificationPriority.optional(),
    audienceRole: z
      .enum(["FARMER", "FPO_ADMIN", "BUYER", "TRANSPORTER", "WAREHOUSE_OPERATOR", "ADMIN", "GOVERNMENT_VIEWER"])
      .nullable()
      .optional(),
    scheduledFor: z.coerce.date().optional(),
  })
  .strict();

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type UpdateNotificationPreferenceBody = z.infer<typeof updateNotificationPreferenceSchema>;
export type CreateAnnouncementBody = z.infer<typeof createAnnouncementSchema>;
