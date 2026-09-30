import {
  Prisma,
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
} from "@prisma/client";
import { env } from "./env";
import { logger } from "./logger";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;

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
  if (error instanceof PrismaClientKnownRequestError) {
    return new Set(["P1001", "P1008", "P1017", "P2024"]).has(error.code);
  }

  if (error instanceof PrismaClientUnknownRequestError) {
    const message = errorMessage(error).toLowerCase();
    return (
      message.includes("can't reach database server") ||
      message.includes("connection") && (
        message.includes("reset") ||
        message.includes("closed") ||
        message.includes("timed out") ||
        message.includes("timeout")
      )
    );
  }

  const message = errorMessage(error).toLowerCase();
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

      const delayMs = baseDelayMs * 2 ** retry;

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

// Keep Prisma imported as a runtime dependency in this module so future
// Prisma error subclasses can be added here without duplicating detection
// logic across individual jobs.
void Prisma;
