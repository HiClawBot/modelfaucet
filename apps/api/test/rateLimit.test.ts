import { describe, expect, it } from "vitest";
import { RedisFixedWindowRateLimiter, type RedisRateLimiterClient } from "../src/index";

class FakeRedisClient implements RedisRateLimiterClient {
  isOpen = true;
  readonly counts = new Map<string, number>();
  readonly ttl = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }

  async pExpire(key: string, milliseconds: number): Promise<boolean> {
    this.ttl.set(key, milliseconds);
    return true;
  }

  async pTTL(key: string): Promise<number> {
    return this.ttl.get(key) ?? -1;
  }

  async disconnect(): Promise<void> {
    this.isOpen = false;
  }
}

describe("RedisFixedWindowRateLimiter", () => {
  it("limits requests through Redis counters", async () => {
    const client = new FakeRedisClient();
    const limiter = new RedisFixedWindowRateLimiter(client, 2, 1000, {
      prefix: "test:api"
    });

    await expect(limiter.check("ip:/v1/sessions", 10)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
      resetAtMs: 1010
    });
    await expect(limiter.check("ip:/v1/sessions", 20)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      resetAtMs: 1020
    });
    await expect(limiter.check("ip:/v1/sessions", 30)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      resetAtMs: 1030
    });
    expect(client.ttl.get("test:api:ip:/v1/sessions")).toBe(1000);
  });

  it("disconnects the Redis client on close", async () => {
    const client = new FakeRedisClient();
    const limiter = new RedisFixedWindowRateLimiter(client, 1, 1000);

    await limiter.close();

    expect(client.isOpen).toBe(false);
  });
});
