import { NotificationCategory, NotificationChannel, Prisma } from "@prisma/client";
import { ValidationError } from "../../common/errors";
import { NotificationPreferenceRepository } from "./notification-preference.repository";
import { MANDATORY_CATEGORIES } from "./notification.types";
import {
  NotificationPreferenceDTO,
  NotificationPreferenceRecord,
  UpdateNotificationPreferenceInput,
} from "./notification.types";

const VALID_CATEGORIES = new Set<string>([
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
const VALID_CHANNELS = new Set<string>(["IN_APP", "WHATSAPP", "EMAIL", "SMS"]);

/**
 * Section 10/11/41 — reads/writes NotificationPreference and is the single
 * place that decides "should channel X actually be used for category Y for
 * this user right now" (isChannelEnabled below), consumed by
 * notification.service.ts's channel-selection step. Never decides *what*
 * to send (that's notification-i18n.ts) or *how* to send it (that's the
 * providers) — preferences only ever gate.
 */
export class NotificationPreferenceService {
  constructor(private readonly repo: NotificationPreferenceRepository) {}

  async get(userId: string): Promise<NotificationPreferenceDTO> {
    const record = await this.repo.getOrCreate(userId);
    return this.toDTO(record);
  }

  async update(userId: string, input: UpdateNotificationPreferenceInput): Promise<NotificationPreferenceDTO> {
    if (input.quietHoursStartHour !== undefined && input.quietHoursStartHour !== null) {
      if (!Number.isInteger(input.quietHoursStartHour) || input.quietHoursStartHour < 0 || input.quietHoursStartHour > 23) {
        throw new ValidationError("quietHoursStartHour must be an integer between 0 and 23.");
      }
    }
    if (input.quietHoursEndHour !== undefined && input.quietHoursEndHour !== null) {
      if (!Number.isInteger(input.quietHoursEndHour) || input.quietHoursEndHour < 0 || input.quietHoursEndHour > 23) {
        throw new ValidationError("quietHoursEndHour must be an integer between 0 and 23.");
      }
    }

    let categoryOverrides: Prisma.InputJsonValue | undefined;
    if (input.categoryOverrides !== undefined) {
      categoryOverrides = this.validateCategoryOverrides(input.categoryOverrides);
    }

    const record = await this.repo.update(userId, {
      ...(input.whatsappEnabled !== undefined ? { whatsappEnabled: input.whatsappEnabled } : {}),
      ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
      ...(input.smsEnabled !== undefined ? { smsEnabled: input.smsEnabled } : {}),
      ...(input.quietHoursStartHour !== undefined ? { quietHoursStartHour: input.quietHoursStartHour } : {}),
      ...(input.quietHoursEndHour !== undefined ? { quietHoursEndHour: input.quietHoursEndHour } : {}),
      ...(categoryOverrides !== undefined ? { categoryOverrides } : {}),
    });

    return this.toDTO(record);
  }

  /**
   * Section 10/11/29 — the actual gate NotificationService consults per
   * (recipient, category, channel). IN_APP is unconditionally true (it is
   * also how the unread bell/badge works — a user can mute WhatsApp/email/
   * SMS but never in-app). CRITICAL priority and the ACCOUNT_SECURITY
   * category always return true (Section 10: "do not allow users to
   * disable mandatory security notifications... critical alerts override
   * preferences"), overriding both the global toggle and any category
   * override.
   */
  async isChannelEnabled(params: {
    userId: string;
    channel: NotificationChannel;
    category: NotificationCategory;
    isCritical: boolean;
  }): Promise<boolean> {
    if (params.channel === "IN_APP") return true;
    if (params.isCritical || MANDATORY_CATEGORIES.has(params.category)) return true;

    const pref = await this.repo.getOrCreate(params.userId);
    const globalEnabled =
      params.channel === "WHATSAPP" ? pref.whatsappEnabled : params.channel === "EMAIL" ? pref.emailEnabled : pref.smsEnabled;

    const overrides = (pref.categoryOverrides as Record<string, Record<string, boolean>> | null) ?? {};
    const categoryOverride = overrides[params.category]?.[params.channel];
    return categoryOverride !== undefined ? categoryOverride : globalEnabled;
  }

  /** Section 10 — quiet hours suppress non-critical push-style channels
   * (WhatsApp/SMS/email) during the user's own local quiet window; never
   * applied to CRITICAL or IN_APP (Section 15/29). Hours are plain
   * hour-of-day integers in the user's own clock — this module does not
   * track a user's timezone anywhere else, so callers pass the hour to
   * check (typically `new Date().getHours()` in the deployment's
   * configured TZ) rather than this method guessing one. */
  isWithinQuietHours(pref: NotificationPreferenceRecord, currentHour: number): boolean {
    const { quietHoursStartHour: start, quietHoursEndHour: end } = pref;
    if (start === null || end === null || start === undefined || end === undefined) return false;
    if (start === end) return false;
    if (start < end) return currentHour >= start && currentHour < end;
    // Wraps past midnight, e.g. 22 -> 7.
    return currentHour >= start || currentHour < end;
  }

  private validateCategoryOverrides(
    overrides: UpdateNotificationPreferenceInput["categoryOverrides"],
  ): Prisma.InputJsonValue {
    const result: Record<string, Record<string, boolean>> = {};
    for (const [category, channels] of Object.entries(overrides ?? {})) {
      if (!VALID_CATEGORIES.has(category)) {
        throw new ValidationError(`Unknown notification category "${category}".`);
      }
      const channelMap: Record<string, boolean> = {};
      for (const [channel, enabled] of Object.entries(channels ?? {})) {
        if (!VALID_CHANNELS.has(channel)) {
          throw new ValidationError(`Unknown notification channel "${channel}".`);
        }
        if (typeof enabled !== "boolean") {
          throw new ValidationError(`Preference for ${category}.${channel} must be true or false.`);
        }
        channelMap[channel] = enabled;
      }
      result[category] = channelMap;
    }
    return result as Prisma.InputJsonValue;
  }

  private toDTO(record: NotificationPreferenceRecord): NotificationPreferenceDTO {
    return {
      whatsappEnabled: record.whatsappEnabled,
      emailEnabled: record.emailEnabled,
      smsEnabled: record.smsEnabled,
      quietHoursStartHour: record.quietHoursStartHour,
      quietHoursEndHour: record.quietHoursEndHour,
      categoryOverrides: (record.categoryOverrides as NotificationPreferenceDTO["categoryOverrides"]) ?? {},
    };
  }
}
