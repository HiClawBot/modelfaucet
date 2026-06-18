import { InMemoryRateLimiter, type RateLimiter, type RateLimitResult } from "@modelfaucet/shared";
import { createClient } from "redis";

export type RedisRateLimiterClient = {
  readonly isOpen: boolean;
  incr: (key: string) => Promise<number>;
  pExpire: (key: string, milliseconds: number) => Promise<boolean | number>;
  pTTL: (key: string) => Promise<number>;
  disconnect: () => Promise<void>;
};

export class RedisFixedWindowRateLimiter implements RateLimiter {
  private readonly prefix: string;

  constructor(
    private readonly client: RedisRateLimiterClient,
    private readonly maxRequests: number,
    private readonly windowMs: number,
    options: { prefix?: string } = {}
  ) {
    this.prefix = options.prefix ?? "modelfaucet:api:rate-limit";
  }

  async check(key: string, nowMs: number): Promise<RateLimitResult> {
    if (this.maxRequests <= 0) {
      return {
        allowed: true,
        remaining: Number.POSITIVE_INFINITY,
        resetAtMs: nowMs + this.windowMs
      };
    }

    const redisKey = `${this.prefix}:${key}`;
    const count = await this.client.incr(redisKey);
    if (count === 1) {
      await this.client.pExpire(redisKey, this.windowMs);
    }

    const ttlMs = await this.client.pTTL(redisKey);
    const effectiveTtlMs = ttlMs > 0 ? ttlMs : this.windowMs;
    const remaining = Math.max(0, this.maxRequests - count);

    return {
      allowed: count <= this.maxRequests,
      remaining,
      resetAtMs: nowMs + effectiveTtlMs
    };
  }

  async close(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.disconnect();
    }
  }
}

export async function createApiRateLimiter(options: {
  redisUrl?: string;
  maxRequests: number;
  windowMs: number;
}): Promise<RateLimiter> {
  if (options.redisUrl === undefined) {
    return new InMemoryRateLimiter(options.maxRequests, options.windowMs);
  }

  const client = createClient({ url: options.redisUrl });
  client.on("error", (error) => {
    console.error("Redis rate limiter error", error);
  });
  await client.connect();

  return new RedisFixedWindowRateLimiter(
    client as unknown as RedisRateLimiterClient,
    options.maxRequests,
    options.windowMs
  );
}
