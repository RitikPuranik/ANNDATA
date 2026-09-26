import {
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  NotificationSourceModule,
  NotificationType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { NotificationListFilters, NotificationRecord } from "./notification.types";

export interface CreateNotificationData {
  recipientUserId: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  sourceModule: NotificationSourceModule;
  sourceEventId: string;
  metadata?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  channels: NotificationChannel[];
}

export interface NotificationListPage {
  items: NotificationRecord[];
  total: number;
  unreadCount: number;
}

/**
 * Section 48 — a plain repository (no business rules) sitting under
 * NotificationService. Every read scopes to a single recipient — Module 22
 * never exposes a "list everyone's notifications" query at this layer
 * (Section 31: even ADMIN does not get blanket visibility here — see
 * notification.authorization.ts).
 */
export class NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Section 16 — idempotent creation. Returns the existing row (with its
   * deliveries) unchanged if this exact (sourceModule, sourceEventId,
   * recipientUserId, type) was already recorded — a retried job/webhook
   * must never fan out a second notification+delivery set. Relies on the
   * `notification_idempotency_key` unique constraint added in this
   * module's own migration; a duplicate insert therefore raises Prisma's
   * P2002, which is caught here and turned into a lookup rather than
   * propagated as an error (Section 51: concurrent duplicate creation must
   * resolve to exactly one logical notification, not a 409).
   */
  async createIdempotent(data: CreateNotificationData): Promise<{ notification: NotificationRecord; created: boolean }> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          recipientUserId: data.recipientUserId,
          type: data.type,
          category: data.category,
          priority: data.priority,
          title: data.title,
          body: data.body,
          relatedEntityType: data.relatedEntityType ?? null,
          relatedEntityId: data.relatedEntityId ?? null,
          sourceModule: data.sourceModule,
          sourceEventId: data.sourceEventId,
          metadata: data.metadata,
          deliveries: {
            create: data.channels.map((channel) => ({ channel, status: "PENDING" as NotificationDeliveryStatus })),
          },
        },
      });
      return { notification, created: true };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const existing = await this.prisma.notification.findUnique({
          where: {
            notification_idempotency_key: {
              sourceModule: data.sourceModule,
              sourceEventId: data.sourceEventId,
              recipientUserId: data.recipientUserId,
              type: data.type,
            },
          },
        });
        if (existing) return { notification: existing, created: false };
      }
      throw err;
    }
  }

  findById(id: string) {
    return this.prisma.notification.findUnique({ where: { id }, include: { deliveries: true } });
  }

  findByPublicId(publicId: string) {
    return this.prisma.notification.findUnique({ where: { publicId }, include: { deliveries: true } });
  }

  async list(recipientUserId: string, filters: NotificationListFilters): Promise<NotificationListPage> {
    const where: Prisma.NotificationWhereInput = {
      recipientUserId,
      ...(filters.unreadOnly ? { readAt: null } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.includeArchived ? {} : { archivedAt: null }),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: { deliveries: true },
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { recipientUserId, readAt: null, archivedAt: null } }),
    ]);

    return { items, total, unreadCount };
  }

  unreadCount(recipientUserId: string): Promise<number> {
    return this.prisma.notification.count({ where: { recipientUserId, readAt: null, archivedAt: null } });
  }

  markRead(id: string): Promise<NotificationRecord> {
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(recipientUserId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { recipientUserId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  archive(id: string): Promise<NotificationRecord> {
    return this.prisma.notification.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  // -------------------------------------------------------------------
  // Delivery-side queries used by NotificationDeliveryService/the retry
  // cron (Section 17/45) — kept here rather than a second repository
  // class, same "one repository per aggregate root + its child rows"
  // convention DisputeRepository already uses for DisputeEvidence/
  // DisputeComment/DisputeHistoryEvent.
  // -------------------------------------------------------------------

  findDelivery(notificationId: string, channel: NotificationChannel) {
    return this.prisma.notificationDelivery.findUnique({
      where: { notificationId_channel: { notificationId, channel } },
    });
  }

  updateDelivery(id: string, data: Prisma.NotificationDeliveryUpdateInput) {
    return this.prisma.notificationDelivery.update({ where: { id }, data });
  }

  /** Section 17/45 — deliveries eligible for a retry sweep: FAILED (a
   * transient failure, see notification-delivery.service.ts) or stuck
   * PENDING/PROCESSING past a staleness window (e.g. the process crashed
   * mid-send — same "recover what a crash left half-done" reasoning as
   * whatsapp-recovery.job.ts), that have not yet exhausted maxAttempts. */
  findRetryableDeliveries(maxAttempts: number, staleBeforeMs: number, limit: number) {
    const staleBefore = new Date(Date.now() - staleBeforeMs);
    return this.prisma.notificationDelivery.findMany({
      where: {
        attempts: { lt: maxAttempts },
        OR: [
          { status: "FAILED" },
          { status: { in: ["PENDING", "PROCESSING"] }, lastAttemptAt: { lt: staleBefore } },
          { status: "PENDING", lastAttemptAt: null },
        ],
      },
      include: { notification: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
