import cron, { ScheduledTask } from "node-cron";
import { logger } from "../config/logger";
import { captureException } from "../config/sentry";
import { withDatabaseRetry } from "../config/database-resilience";
import { MAX_DELIVERY_ATTEMPTS, NotificationDeliveryService } from "../modules/notifications/notification-delivery.service";
import { NotificationAnnouncementService } from "../modules/notifications/notification-announcement.service";
import { NotificationRepository } from "../modules/notifications/notification.repository";

/**
 * Section 17/45 — Anndata has no job queue (see whatsapp-recovery.job.ts's
 * own comment), so retries for FAILED/stuck deliveries are driven by this
 * per-minute sweep rather than a queue consumer.
 *
 * Database reads in this background job are retried because Neon connections
 * can be temporarily unavailable. The job itself must survive that transient
 * infrastructure failure; the next cron tick remains the final fallback.
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
      const deliveries = await withDatabaseRetry(
        () => repo.findRetryableDeliveries(MAX_DELIVERY_ATTEMPTS, STALE_AFTER_MS, SWEEP_BATCH_SIZE),
        { operation: "notification-retry.findRetryableDeliveries" },
      );

      for (const d of deliveries) {
        // eslint-disable-next-line no-await-in-loop
        await delivery.attempt(d.notification, d);
      }

      if (deliveries.length > 0) {
        logger.info(
          { event: "notification-retry", count: deliveries.length },
          "[Notifications] retried stuck/failed deliveries",
        );
      }

      const due = await withDatabaseRetry(
        () => announcements.findDueScheduled(),
        { operation: "notification-retry.findDueScheduled" },
      );

      for (const announcement of due) {
        // eslint-disable-next-line no-await-in-loop
        await announcements.publish(announcement);
      }

      if (due.length > 0) {
        logger.info(
          { event: "announcement-publish", count: due.length },
          "[Notifications] published due scheduled announcements",
        );
      }
    } catch (err) {
      // A final failure is still reported to Sentry, but the scheduled task
      // exits cleanly and the worker remains alive for the next sweep.
      captureException(err, {
        job: "notification-retry",
        operation: "database-or-delivery-sweep",
      });
    } finally {
      running = false;
    }
  });

  logger.info("[Notifications] retry/scheduler job scheduled (every minute)");
  return task;
}
