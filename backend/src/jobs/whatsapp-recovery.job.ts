import cron, { ScheduledTask } from "node-cron";
import { logger } from "../config/logger";
import { captureException } from "../config/sentry";
import type { WhatsAppModule } from "../modules/whatsapp";

/**
 * ANNDATA has no job queue, so the webhook persists each inbound message and
 * then processes it in-process right after replying 200. If the process
 * crashes (or a deploy restarts it) between "persisted" and "answered", this
 * per-minute sweep re-drives those messages. The database claim
 * (RECEIVED→PROCESSING, compare-and-set) plus the outbound idempotency keys
 * mean a message is never processed or answered twice, even if several
 * instances run this job.
 */
export function registerWhatsAppRecoveryJob(whatsapp: WhatsAppModule | undefined): ScheduledTask | null {
  if (!whatsapp || !whatsapp.config.enabled) return null;
  let running = false;
  const task = cron.schedule("* * * * *", async () => {
    if (running) return;
    running = true;
    try {
      const n = await whatsapp.webhookService.recoverStuck();
      if (n > 0) logger.info({ event: "recovered", count: n }, "[WhatsApp] recovered stuck inbound messages");
    } catch (err) {
      captureException(err, { job: "whatsapp-recovery" });
    } finally {
      running = false;
    }
  });
  logger.info("[WhatsApp] recovery job scheduled (every minute)");
  return task;
}
