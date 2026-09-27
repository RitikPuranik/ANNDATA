import { NotificationChannel, NotificationDeliveryStatus } from "@prisma/client";
import { logger } from "../../config/logger";
import { NotificationRepository } from "./notification.repository";
import { NotificationDeliveryRecord, NotificationRecord } from "./notification.types";
import { NotificationProvider } from "./providers/notification-provider.interface";

/** Section 17 — a delivery stops being retried once it has been attempted
 * this many times; the final attempt's outcome is what remains. */
export const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * Section 5/6/8/17/52 — the layer that actually calls out to a channel
 * provider and records what happened, one NotificationDelivery row at a
 * time. Never decides *whether* to notify (that's NotificationService) —
 * only *how* a single already-decided (notification, channel) pair gets
 * attempted, and how its result is preserved.
 *
 * Failure here is always best-effort and swallowed at the boundary
 * (attempt() never throws): a provider outage must never surface as an
 * error to whatever business transaction triggered the notification
 * (Section 20/52 — "a notification provider failure must not corrupt the
 * originating business transaction").
 */
export class NotificationDeliveryService {
  private readonly providers: Map<NotificationChannel, NotificationProvider>;

  constructor(
    private readonly repo: NotificationRepository,
    providers: NotificationProvider[],
  ) {
    this.providers = new Map(providers.map((p) => [p.channel, p]));
  }

  /** Attempts every PENDING delivery attached to a freshly created
   * notification. Called synchronously right after creation — Anndata has
   * no job queue (see the retry cron's own comment), so a best-effort
   * inline attempt is the "asynchronous enough" version of Section 19/20's
   * "queue a job, a worker sends it later": the caller (NotificationService
   * .publish()) never awaits anything that could itself block on an
   * external provider before returning to its own caller — see that
   * method's own comment. */
  async attemptAll(notification: NotificationRecord, deliveries: NotificationDeliveryRecord[]): Promise<void> {
    await Promise.all(deliveries.map((delivery) => this.attempt(notification, delivery)));
  }

  async attempt(notification: NotificationRecord, delivery: NotificationDeliveryRecord): Promise<void> {
    const provider = this.providers.get(delivery.channel);
    if (!provider) {
      await this.repo.updateDelivery(delivery.id, {
        status: "FAILED",
        failureReason: "No provider registered for this channel.",
        failedAt: new Date(),
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      });
      return;
    }

    await this.repo.updateDelivery(delivery.id, { status: "PROCESSING", lastAttemptAt: new Date(), attempts: { increment: 1 } });

    try {
      const result = await provider.send({
        recipientUserId: notification.recipientUserId,
        title: notification.title,
        body: notification.body,
      });

      if (result.success) {
        // Section 6 — a provider ACCEPT is SENT, never DELIVERED, unless
        // the provider itself confirms delivery (no channel here does
        // today — the in-app provider is the sole exception since, for
        // in-app, "accepted" and "delivered" are the same event: the row
        // already exists).
        const status: NotificationDeliveryStatus = delivery.channel === "IN_APP" ? "DELIVERED" : "SENT";
        await this.repo.updateDelivery(delivery.id, {
          status,
          provider: provider.name,
          providerMessageId: result.providerMessageId ?? null,
          ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
          failureReason: null,
        });
        return;
      }

      const attemptsSoFar = delivery.attempts + 1;
      const exhausted = attemptsSoFar >= MAX_DELIVERY_ATTEMPTS || result.retryable === false;
      await this.repo.updateDelivery(delivery.id, {
        status: exhausted ? "FAILED" : "PENDING",
        provider: provider.name,
        failureReason: result.error ?? "Delivery failed.",
        ...(exhausted ? { failedAt: new Date() } : {}),
      });
    } catch (err) {
      // Providers are contractually not supposed to throw, but a
      // best-effort delivery layer never trusts that absolutely.
      logger.error({ err, channel: delivery.channel, notificationId: notification.id }, "Notification provider threw unexpectedly");
      const attemptsSoFar = delivery.attempts + 1;
      const exhausted = attemptsSoFar >= MAX_DELIVERY_ATTEMPTS;
      await this.repo.updateDelivery(delivery.id, {
        status: exhausted ? "FAILED" : "PENDING",
        failureReason: "Unexpected provider error.",
        ...(exhausted ? { failedAt: new Date() } : {}),
      });
    }
  }
}
