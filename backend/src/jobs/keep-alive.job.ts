import cron, { ScheduledTask } from "node-cron";
import { env, isProduction } from "../config/env";
import { logger } from "../config/logger";

/**
 * Keeps the Render web service warm by requesting its own public health
 * endpoint every 5 minutes.
 *
 * This job is intentionally production-only. In development/test, no
 * timer is created and no network request is made.
 *
 * NOTE: A cron running inside the same Render web service is not a reliable
 * way to prevent sleeping on plans where the service is allowed to sleep,
 * because the process itself can be suspended. For a guaranteed keep-alive,
 * use an external scheduler/monitor to call the public backend URL.
 */
export function registerKeepAliveJob(): ScheduledTask | null {
  if (!isProduction) {
    logger.info("Keep-alive cron disabled: NODE_ENV is not production");
    return null;
  }

  const url = env.BACKEND_URL.replace(/\/$/, "") + "/";

  const task = cron.schedule("*/5 * * * *", async () => {
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "ANNDATA-KeepAlive/1.0",
        },
        signal: AbortSignal.timeout(10_000),
      });

      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        logger.warn(
          { status: response.status, durationMs, url },
          "Keep-alive ping returned a non-2xx response",
        );
        return;
      }

      logger.info(
        { status: response.status, durationMs },
        "Keep-alive ping successful",
      );
    } catch (error) {
      logger.error(
        { err: error, url },
        "Keep-alive ping failed",
      );
    }
  });

  logger.info("Keep-alive cron scheduled: every 5 minutes -> " + url);
  return task;
}