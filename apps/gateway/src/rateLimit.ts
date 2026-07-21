import { InMemoryRateLimiter, type RateLimiter, type RateLimitResult } from "@modelfaucet/shared";
import { createClient } from "redis";

export type RedisRateLimiterClient = {
  readonly isOpen: boolean;
  eval: (
    script: string,
    options: { keys: string[]; arguments: string[] }
  ) => Promise<unknown>;
  ping: () => Promise<string>;
  disconnect: () => Promise<void>;
};

const fixedWindowScript = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

export class RedisFixedWindowRateLimiter implements RateLimiter {
  private readonly prefix: string;

  constructor(
    private readonly client: RedisRateLimiterClient,
    private readonly maxRequests: number,
    private readonly windowMs: number,
    options: { prefix?: string } = {}
  ) {
    this.prefix = options.prefix ?? "modelfaucet:gateway:rate-limit";
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
    const result = await this.client.eval(fixedWindowScript, {
      keys: [redisKey],
      arguments: [String(this.windowMs)]
    });
    if (!Array.isArray(result) || result.length < 2) {
      throw new Error("Redis rate limiter returned an invalid result.");
    }
    const count = Number(result[0]);
    const ttlMs = Number(result[1]);
    if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
      throw new Error("Redis rate limiter returned non-numeric counters.");
    }
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

  async checkHealth(): Promise<void> {
    const response = await this.client.ping();
    if (response !== "PONG") {
      throw new Error("Redis readiness check failed.");
    }
  }
}

export async function createGatewayRateLimiter(options: {
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
