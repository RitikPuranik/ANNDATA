import { getRedis } from "../../config/redis";
import { logger } from "../../config/logger";
import { LatestLocationDTO } from "./shipment.types";
import { getGpsLocationCacheTtlSeconds } from "./shipment.config";

/**
 * Step 15 — Redis latest-location cache, never load-bearing (same
 * convention as logistics-cache.ts's own getCached()/setCached(): every
 * call here degrades to a cache miss, never an error, when Redis is
 * unavailable). PostgreSQL remains the source of truth — a cache miss or a
 * Redis outage always falls back to a live DB read, and a GPS update is
 * always persisted to PostgreSQL first regardless of whether the cache
 * write that follows succeeds.
 */

function cacheKey(shipmentPublicId: string): string {
  return `shipment:${shipmentPublicId}:latest-location`;
}

export async function getCachedLatestLocation(shipmentPublicId: string): Promise<LatestLocationDTO | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(cacheKey(shipmentPublicId));
    if (!raw) return null;
    return JSON.parse(raw) as LatestLocationDTO;
  } catch (err) {
    logger.warn({ err, shipmentPublicId }, "Shipment location cache read failed — falling back to the database");
    return null;
  }
}

export async function setCachedLatestLocation(shipmentPublicId: string, value: LatestLocationDTO): Promise<void> {
  const redis = getRedis();
  const ttl = getGpsLocationCacheTtlSeconds();
  if (!redis || ttl <= 0) return;
  try {
    await redis.set(cacheKey(shipmentPublicId), JSON.stringify(value), "EX", ttl);
  } catch (err) {
    logger.warn({ err, shipmentPublicId }, "Shipment location cache write failed — continuing without caching this update");
  }
}
