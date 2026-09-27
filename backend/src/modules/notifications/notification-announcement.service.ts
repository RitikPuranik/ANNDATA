import { NotificationAnnouncement, PrismaClient, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { CreateAnnouncementBody } from "./notification.schemas";
import { NotificationService } from "./notification.service";

/**
 * Section 44 — manual admin notifications. Publishing an announcement is
 * authoring, not a parallel send path: it fans out into ordinary
 * Notification rows (one per targeted, ACTIVE recipient) through
 * NotificationService.publish() — the exact same idempotent, preference-
 * aware, templated pipeline every other module's event goes through
 * (Section 44: "no arbitrary mass messaging" — this is the same pipeline,
 * not a bypass of it). Section 56/44: this is not a marketing platform —
 * there is no per-user targeting list, only a role-wide audience, and
 * every publish is attributed to the admin who authored it via the audit
 * log (Section 43).
 */
export class NotificationAnnouncementService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  async create(admin: AuthenticatedUserContext, input: CreateAnnouncementBody): Promise<NotificationAnnouncement> {
    const announcement = await this.prisma.notificationAnnouncement.create({
      data: {
        title: input.title,
        body: input.body,
        priority: input.priority ?? "NORMAL",
        audienceRole: input.audienceRole ?? null,
        createdByUserId: admin.id,
        scheduledFor: input.scheduledFor ?? null,
      },
    });

    await this.audit.record({
      actorUserId: admin.id,
      action: "NOTIFICATION_ANNOUNCEMENT_CREATED",
      entityType: "NotificationAnnouncement",
      entityId: announcement.id,
      metadata: { title: input.title, audienceRole: input.audienceRole ?? "ALL" },
    });

    // Section 45 — scheduled announcements wait for the retry/scheduler
    // cron to publish them (see notification-retry.job.ts); an
    // unscheduled one publishes immediately.
    if (!announcement.scheduledFor || announcement.scheduledFor <= new Date()) {
      await this.publish(announcement);
    }

    return announcement;
  }

  /** Publishes one announcement (immediate or due-scheduled) by fanning it
   * out to every ACTIVE user matching its audience role, one
   * SYSTEM_ANNOUNCEMENT Notification per recipient. Idempotent per
   * recipient (Section 16: sourceEventId is the announcement id, so
   * re-running this for an already-published announcement never
   * duplicates anyone's copy). */
  async publish(announcement: NotificationAnnouncement): Promise<number> {
    const recipients = await this.prisma.user.findMany({
      where: {
        accountStatus: "ACTIVE",
        ...(announcement.audienceRole ? { role: announcement.audienceRole as UserRole } : {}),
      },
      select: { id: true },
    });

    for (const recipient of recipients) {
      // eslint-disable-next-line no-await-in-loop
      await this.notifications.publish({
        recipientUserId: recipient.id,
        type: "SYSTEM_ANNOUNCEMENT",
        sourceModule: "ADMIN_ANNOUNCEMENT",
        sourceEventId: announcement.id,
        vars: { title: announcement.title, message: announcement.body },
        relatedEntityType: "NotificationAnnouncement",
        relatedEntityId: announcement.id,
        priorityOverride: announcement.priority as never,
      });
    }

    if (!announcement.publishedAt) {
      await this.prisma.notificationAnnouncement.update({
        where: { id: announcement.id },
        data: { publishedAt: new Date() },
      });
    }

    return recipients.length;
  }

  /** Section 45 — due scheduled announcements the retry cron sweeps. */
  findDueScheduled(): Promise<NotificationAnnouncement[]> {
    return this.prisma.notificationAnnouncement.findMany({
      where: { publishedAt: null, scheduledFor: { lte: new Date() } },
    });
  }
}
