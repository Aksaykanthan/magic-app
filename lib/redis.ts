import "server-only";
import Redis from "ioredis";
import { env } from "@/lib/env";

/**
 * Redis singleton (ioredis). Backs rate limiting, caching, and the
 * better-auth secondary storage adapter (see lib/auth.ts).
 */
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    // Connect lazily — Next.js imports route modules during `next build` to
    // collect metadata even for statically-rendered pages, which would
    // otherwise open (and noisily retry) a connection with no server up.
    lazyConnect: true,
  });

if (env.NODE_ENV !== "production") globalForRedis.redis = redis;

/** JSON convenience helpers on top of the raw string client. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  return value ? (JSON.parse(value) as T) : null;
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  const payload = JSON.stringify(value);
  if (ttlSeconds) {
    await redis.set(key, payload, "EX", ttlSeconds);
  } else {
    await redis.set(key, payload);
  }
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}
