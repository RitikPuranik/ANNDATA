import { Language, NotificationChannel, NotificationSourceModule, NotificationType, PrismaClient } from "@prisma/client";
import { NotFoundError } from "../../common/errors";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { renderNotificationTemplate, TemplateVars } from "./notification-i18n";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { NotificationAuthorizationService } from "./notification.authorization";
import { NotificationPreferenceService } from "./notification-preference.service";
import { NotificationRepository } from "./notification.repository";
import {
  NotificationDTO,
  NotificationDeliveryDTO,
  NotificationListFilters,
  NotificationPage,
  NOTIFICATION_TYPE_CATEGORY,
  priorityForType,
} from "./notification.types";

/**
 * Section 2/58 — Module 22's core pipeline:
 *
 *   BUSINESS EVENT (publish() input)
 *     -> recipient (already resolved by the caller — see publish()'s own
 *        comment on why Module 22 does not re-derive who a farmer/buyer/
 *        FPO admin is)
 *     -> idempotency check (NotificationRepository.createIdempotent)
 *     -> preference check (NotificationPreferenceService)
 *     -> localized template render (notification-i18n.ts)
 *     -> channel selection
 *     -> delivery (NotificationDeliveryService)
 *     -> retry/failure handling (delivery layer + the retry cron)
 *     -> history (the Notification/NotificationDelivery rows themselves,
 *        plus the audit log for preference/admin actions — Section 43)
 *
 * This is the ONE place every other module's event ultimately calls into
 * (via NotificationEventPublisher) — see that file's own module doc for
 * which source modules are wired in today.
 */
export interface PublishNotificationInput {
  recipientUserId: string;
  type: NotificationType;
  sourceModule: NotificationSourceModule;
  /** The originating module's own event/entity id — combined with
   * recipientUserId + type, this is the idempotency key (Section 16). Pass
   * something stable across retries (e.g. a PaymentRecord id, or
   * `${disputeId}:RESOLVED`), never a freshly generated uuid per call. */
  sourceEventId: string;
  vars: TemplateVars;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
  /** Section 15 — override the type's own default priority only for a
   * genuine per-event reason (e.g. an ADMIN-authored CRITICAL
   * announcement); omit to use priorityForType(type). */
  priorityOverride?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
}

export class NotificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repo: NotificationRepository,
    private readonly preferences: NotificationPreferenceService,
    private readonly delivery: NotificationDeliveryService,
    private readonly authorization: NotificationAuthorizationService,
  ) {}

  /**
   * Section 2 — the single entry point every domain event flows through.
   * Never throws for anything downstream of "notification row created" —
   * a channel being unavailable, a provider failing, or a preference
   * disabling every non-in-app channel are all ordinary, expected
   * outcomes, never surfaced as an exception to the caller (which is
   * typically another module's service, mid-way through its own already-
   * committed business transaction — see Section 20/52). The one thing
   * that CAN throw is a genuinely unexpected database error creating the
   * Notification/NotificationDelivery rows themselves, which callers
   * should treat as best-effort too (NotificationEventPublisher's own
   * notify() wraps every call in a try/catch for exactly this reason).
   */
  async publish(input: PublishNotificationInput): Promise<NotificationDTO | null> {
    const category = NOTIFICATION_TYPE_CATEGORY[input.type];
    const priority = input.priorityOverride ?? priorityForType(input.type);
    const isCritical = priority === "CRITICAL";

    const user = await this.prisma.user.findUnique({
      where: { id: input.recipientUserId },
      select: { preferredLanguage: true },
    });
    if (!user) return null; // Recipient no longer exists — nothing to notify.

    const lang: Language = user.preferredLanguage;
    const { title, body } = renderNotificationTemplate(input.type, lang, input.vars);

    const channels = await this.resolveChannels({
      userId: input.recipientUserId,
      category,
      isCritical,
    });

    const { notification, created } = await this.repo.createIdempotent({
      recipientUserId: input.recipientUserId,
      type: input.type,
      category,
      priority,
      title,
      body,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      sourceModule: input.sourceModule,
      sourceEventId: input.sourceEventId,
      metadata: (input.metadata as never) ?? undefined,
      channels,
    });

    if (!created) {
      // Section 16 — a retried event must not re-attempt delivery either;
      // the first successful publish() already dispatched it.
      return this.toDTO(notification, await this.prisma.notificationDelivery.findMany({ where: { notificationId: notification.id } }));
    }

    const deliveries = await this.prisma.notificationDelivery.findMany({ where: { notificationId: notification.id } });
    // Fire-and-forget from the caller's perspective: publish() itself
    // still awaits this (Section 19's worker step has no queue to hand
    // off to in this codebase — see NotificationDeliveryService's own
    // comment), but every failure inside attemptAll() is already
    // swallowed into delivery-row state, so this never rejects.
    await this.delivery.attemptAll(notification, deliveries);

    const finalDeliveries = await this.prisma.notificationDelivery.findMany({ where: { notificationId: notification.id } });
    return this.toDTO(notification, finalDeliveries);
  }

  async list(user: AuthenticatedUserContext, filters: NotificationListFilters): Promise<NotificationPage> {
    const page = await this.repo.list(user.id, filters);
    return {
      items: page.items.map((n) => this.toDTO(n, n.deliveries)),
      total: page.total,
      unreadCount: page.unreadCount,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async unreadCount(user: AuthenticatedUserContext): Promise<number> {
    return this.repo.unreadCount(user.id);
  }

  async get(user: AuthenticatedUserContext, publicId: string): Promise<NotificationDTO> {
    const notification = await this.repo.findByPublicId(publicId);
    if (!notification) throw new NotFoundError("Notification not found.");
    this.authorization.assertCanAccess(user, notification);
    const deliveries = await this.prisma.notificationDelivery.findMany({ where: { notificationId: notification.id } });
    return this.toDTO(notification, deliveries);
  }

  /** Section 33 — reading never deletes; it only stamps readAt. */
  async markRead(user: AuthenticatedUserContext, publicId: string): Promise<NotificationDTO> {
    const notification = await this.repo.findByPublicId(publicId);
    if (!notification) throw new NotFoundError("Notification not found.");
    this.authorization.assertCanAccess(user, notification);
    const updated = notification.readAt ? notification : await this.repo.markRead(notification.id);
    const deliveries = await this.prisma.notificationDelivery.findMany({ where: { notificationId: notification.id } });
    return this.toDTO(updated, deliveries);
  }

  async markAllRead(user: AuthenticatedUserContext): Promise<number> {
    return this.repo.markAllRead(user.id);
  }

  /** Section 34 — archiving hides from the default inbox but never
   * deletes the historical record. */
  async archive(user: AuthenticatedUserContext, publicId: string): Promise<void> {
    const notification = await this.repo.findByPublicId(publicId);
    if (!notification) throw new NotFoundError("Notification not found.");
    this.authorization.assertCanAccess(user, notification);
    await this.repo.archive(notification.id);
  }

  /**
   * Section 7/10/29 — decides which channels a notification fans out to.
   * IN_APP is always included (Section 9/33: in-app is first-class and
   * never optional). WHATSAPP/EMAIL/SMS are included only when the
   * recipient's preferences allow it for this category right now — a
   * disabled/quiet-hours channel is simply never attempted, never
   * recorded as a "failed" delivery (Section 18: this doubles as the
   * rate-limiting/storm-prevention Section 18 asks for for non-critical
   * categories, since a muted channel produces zero delivery rows at all).
   */
  private async resolveChannels(params: {
    userId: string;
    category: (typeof NOTIFICATION_TYPE_CATEGORY)[NotificationType];
    isCritical: boolean;
  }): Promise<NotificationChannel[]> {
    const candidates: NotificationChannel[] = ["IN_APP", "WHATSAPP", "EMAIL", "SMS"];
    const enabled: NotificationChannel[] = [];
    for (const channel of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const on = await this.preferences.isChannelEnabled({
        userId: params.userId,
        channel,
        category: params.category,
        isCritical: params.isCritical,
      });
      if (on) enabled.push(channel);
    }
    return enabled;
  }

  private toDTO(
    notification: { id: string; publicId: string; type: NotificationType; category: string; priority: string; title: string; body: string; relatedEntityType: string | null; relatedEntityId: string | null; sourceModule: NotificationSourceModule; readAt: Date | null; archivedAt: Date | null; createdAt: Date },
    deliveries: { channel: NotificationChannel; status: string; attempts: number; deliveredAt: Date | null; failedAt: Date | null; failureReason: string | null }[],
  ): NotificationDTO {
    return {
      id: notification.publicId,
      type: notification.type,
      category: notification.category as never,
      priority: notification.priority as never,
      title: notification.title,
      body: notification.body,
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId,
      sourceModule: notification.sourceModule,
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
      archivedAt: notification.archivedAt ? notification.archivedAt.toISOString() : null,
      createdAt: notification.createdAt.toISOString(),
      deliveries: deliveries.map(
        (d): NotificationDeliveryDTO => ({
          channel: d.channel,
          status: d.status as never,
          attempts: d.attempts,
          deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
          failedAt: d.failedAt ? d.failedAt.toISOString() : null,
          failureReason: d.failureReason,
        }),
      ),
    };
  }
}
