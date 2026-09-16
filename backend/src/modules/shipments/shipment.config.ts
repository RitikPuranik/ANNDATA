import { env } from "../../config/env";

/**
 * Module 17 — centralized, env-driven configuration (Step 34: only the
 * settings actually required by this module — cache TTL, future-timestamp
 * tolerance, and the location-history batch/page cap).
 */

export function getGpsLocationCacheTtlSeconds(): number {
  return env.GPS_LOCATION_CACHE_TTL_SECONDS;
}

export function getGpsFutureTimestampToleranceSeconds(): number {
  return env.GPS_FUTURE_TIMESTAMP_TOLERANCE_SECONDS;
}

export function getShipmentLocationMaxBatchSize(): number {
  return env.SHIPMENT_LOCATION_MAX_BATCH_SIZE;
}
