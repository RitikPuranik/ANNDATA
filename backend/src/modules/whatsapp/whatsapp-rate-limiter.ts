import { getRedis } from "../../config/redis";
import { logger } from "../../config/logger";

/**
 * Fixed-window counters keyed by phone / farmer / feature. Uses the repo's
 * existing Redis client (config/redis.ts) and falls back to an in-process map
 * when Redis is not configured or unreachable — the same degrade-gracefully
 * pattern as the rest of the codebase. (express-rate-limit, used for HTTP
 * routes, can't be used here: these limits apply to asynchronous message
 * processing, not to an HTTP request.)
 */
export class WhatsAppRateLimiter {
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  /** Returns true when the action is ALLOWED (and counts it). */
  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (limit <= 0) return false;
    const redisKey = `wa:rl:${key}`;
    const redis = getRedis();
    if (redis) {
      try {
        const count = await redis.incr(redisKey);
        if (count === 1) await redis.expire(redisKey, windowSeconds);
        return count <= limit;
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "[WhatsApp] rate limiter Redis error; using in-memory fallback");
      }
    }
    const now = Date.now();
    const entry = this.memory.get(redisKey);
    if (!entry || entry.resetAt <= now) {
      this.memory.set(redisKey, { count: 1, resetAt: now + windowSeconds * 1000 });
      this.prune(now);
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  }

  private prune(now: number): void {
    if (this.memory.size < 5000) return;
    for (const [k, v] of this.memory) if (v.resetAt <= now) this.memory.delete(k);
  }
}
