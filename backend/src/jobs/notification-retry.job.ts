import cron, { ScheduledTask } from "node-cron";
import { logger } from "../config/logger";
import { captureException } from "../config/sentry";
import { MAX_DELIVERY_ATTEMPTS, NotificationDeliveryService } from "../modules/notifications/notification-delivery.service";
import { NotificationAnnouncementService } from "../modules/notifications/notification-announcement.service";
import { NotificationRepository } from "../modules/notifications/notification.repository";

/**
 * Section 17/45 — Anndata has no job queue (see whatsapp-recovery.job.ts's
 * own comment), so retries for FAILED/stuck deliveries are driven by this
 * per-minute sweep rather than a queue consumer. A delivery only becomes
 * eligible once (see NotificationRepository.findRetryableDeliveries):
 *   - it is FAILED and has not exhausted MAX_DELIVERY_ATTEMPTS (a
 *     permanent failure — retryable: false — is never re-attempted, so it
 *     never appears here in the first place — see
 *     NotificationDeliveryService.attempt), or
 *   - it is PENDING/PROCESSING but stuck past a staleness window (the
 *     process crashed mid-send — same "recover what a crash left
 *     half-done" reasoning as the WhatsApp webhook recovery job).
 *
 * Also publishes any admin announcement whose scheduledFor has come due
 * (Section 45's "scheduled alerts if supported").
 */
const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes
const SWEEP_BATCH_SIZE = 200;

export function registerNotificationRetryJob(
  repo: NotificationRepository,
  delivery: NotificationDeliveryService,
  announcements: NotificationAnnouncementService,
): ScheduledTask {
  let running = false;
  const task = cron.schedule("* * * * *", async () => {
    if (running) return;
    running = true;
    try {
      const deliveries = await repo.findRetryableDeliveries(MAX_DELIVERY_ATTEMPTS, STALE_AFTER_MS, SWEEP_BATCH_SIZE);
      for (const d of deliveries) {
        // eslint-disable-next-line no-await-in-loop
        await delivery.attempt(d.notification, d);
      }
      if (deliveries.length > 0) {
        logger.info({ event: "notification-retry", count: deliveries.length }, "[Notifications] retried stuck/failed deliveries");
      }

      const due = await announcements.findDueScheduled();
      for (const announcement of due) {
        // eslint-disable-next-line no-await-in-loop
        await announcements.publish(announcement);
      }
      if (due.length > 0) {
        logger.info({ event: "announcement-publish", count: due.length }, "[Notifications] published due scheduled announcements");
      }
    } catch (err) {
      captureException(err, { job: "notification-retry" });
    } finally {
      running = false;
    }
  });
  logger.info("[Notifications] retry/scheduler job scheduled (every minute)");
  return task;
}
