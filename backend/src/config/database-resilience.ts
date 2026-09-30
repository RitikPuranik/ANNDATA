import { PrismaClientKnownRequestError, PrismaClientUnknownRequestError } from "@prisma/client";
import { env } from "./env";
import { logger } from "./logger";

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 750;

export interface DatabaseRetryOptions {
  operation: string;
  maxRetries?: number;
  baseDelayMs?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Prisma/Neon errors that are safe to retry because they represent a
 * temporary inability to establish/use a database connection.
 *
 * Do not treat arbitrary Prisma errors as transient. Business/data errors
 * must fail immediately instead of being repeated.
 */
export function isTransientDatabaseError(error: unknown): boolean {
  // Prefer the Prisma error code, but do not depend exclusively on
  // instanceof because Prisma errors can cross runtime/package boundaries.
  const code =
    error instanceof PrismaClientKnownRequestError
      ? error.code
      : typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;

  if (code && new Set(["P1001", "P1008", "P1017", "P2024"]).has(code)) {
    return true;
  }

  const message = errorMessage(error).toLowerCase();

  if (error instanceof PrismaClientUnknownRequestError) {
    return (
      message.includes("can't reach database server") ||
      (message.includes("connection") &&
        (message.includes("reset") ||
          message.includes("closed") ||
          message.includes("timed out") ||
          message.includes("timeout")))
    );
  }

  return (
    message.includes("can't reach database server") ||
    message.includes("connection terminated") ||
    message.includes("connection reset") ||
    message.includes("connection closed") ||
    message.includes("connection timed out") ||
    message.includes("connection timeout")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries only transient database connectivity failures with bounded
 * exponential backoff. This intentionally does not reconnect/disconnect
 * Prisma on every failure, which can make pool pressure worse.
 */
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  options: DatabaseRetryOptions,
): Promise<T> {
  const maxRetries = options.maxRetries ?? env.DB_OPERATION_MAX_RETRIES ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? env.DB_OPERATION_RETRY_BASE_DELAY_MS ?? DEFAULT_BASE_DELAY_MS;

  for (let retry = 0; ; retry += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientDatabaseError(error) || retry >= maxRetries) {
        throw error;
      }

      // Small jitter prevents multiple cron/worker instances from retrying
      // the same Neon outage in lockstep.
      const jitterMs = Math.floor(Math.random() * Math.max(1, baseDelayMs / 2));
      const delayMs = baseDelayMs * 2 ** retry + jitterMs;

      logger.warn(
        {
          event: "database-operation-retry",
          operation: options.operation,
          retry: retry + 1,
          maxRetries,
          delayMs,
        },
        "[Database] transient connectivity failure; retrying",
      );

      await sleep(delayMs);
    }
  }
}
