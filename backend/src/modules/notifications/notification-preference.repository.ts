import { Prisma, PrismaClient } from "@prisma/client";
import { NotificationPreferenceRecord } from "./notification.types";

/**
 * Section 11 — "new users should receive sensible defaults... do not
 * require the user to manually configure every notification before
 * receiving important events." Rather than a migration seeding a row for
 * every existing user, a preference row is materialized lazily on first
 * read/write with the column defaults declared in the Prisma schema
 * (whatsappEnabled/emailEnabled = true, smsEnabled = false, no quiet
 * hours, no category overrides) — functionally identical to "every user
 * already has sensible defaults" without a backfill migration.
 */
export class NotificationPreferenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreate(userId: string): Promise<NotificationPreferenceRecord> {
    const existing = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    if (existing) return existing;
    try {
      return await this.prisma.notificationPreference.create({ data: { userId } });
    } catch (err) {
      // Concurrent first-read race — another request already created it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const created = await this.prisma.notificationPreference.findUnique({ where: { userId } });
        if (created) return created;
      }
      throw err;
    }
  }

  update(userId: string, data: Prisma.NotificationPreferenceUpdateInput): Promise<NotificationPreferenceRecord> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { ...(data as Prisma.NotificationPreferenceUncheckedCreateInput), userId },
      update: data,
    });
  }
}
