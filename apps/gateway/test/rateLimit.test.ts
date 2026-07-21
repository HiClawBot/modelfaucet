import { describe, expect, it } from "vitest";
import { RedisFixedWindowRateLimiter, type RedisRateLimiterClient } from "../src/index";

class FakeRedisClient implements RedisRateLimiterClient {
  isOpen = true;
  readonly counts = new Map<string, number>();
  readonly ttl = new Map<string, number>();

  async ping(): Promise<string> {
    return "PONG";
  }

  async eval(
    _script: string,
    options: { keys: string[]; arguments: string[] }
  ): Promise<[number, number]> {
    const key = options.keys[0];
    if (key === undefined) {
      throw new Error("Expected one Redis key.");
    }
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    const windowMs = Number(options.arguments[0]);
    const ttl = this.ttl.get(key) ?? -1;
    if (next === 1 || ttl < 0) {
      this.ttl.set(key, windowMs);
      return [next, windowMs];
    }
    return [next, ttl];
  }

  async disconnect(): Promise<void> {
    this.isOpen = false;
  }
}

describe("RedisFixedWindowRateLimiter", () => {
  it("limits gateway requests through Redis counters", async () => {
    const client = new FakeRedisClient();
    const limiter = new RedisFixedWindowRateLimiter(client, 2, 1000, {
      prefix: "test:gateway"
    });

    await expect(limiter.check("ip:/v1/chat/completions", 10)).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
      resetAtMs: 1010
    });
    await expect(limiter.check("ip:/v1/chat/completions", 20)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      resetAtMs: 1020
    });
    await expect(limiter.check("ip:/v1/chat/completions", 30)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
      resetAtMs: 1030
    });
    expect(client.ttl.get("test:gateway:ip:/v1/chat/completions")).toBe(1000);
  });

  it("repairs a counter that lost its expiry in the same atomic operation", async () => {
    const client = new FakeRedisClient();
    client.counts.set("test:gateway:ip:/v1/chat/completions", 1);
    const limiter = new RedisFixedWindowRateLimiter(client, 2, 1000, {
      prefix: "test:gateway"
    });

    await expect(limiter.check("ip:/v1/chat/completions", 10)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      resetAtMs: 1010
    });
    expect(client.ttl.get("test:gateway:ip:/v1/chat/completions")).toBe(1000);
  });

  it("disconnects the Redis client on close", async () => {
    const client = new FakeRedisClient();
    const limiter = new RedisFixedWindowRateLimiter(client, 1, 1000);

    await limiter.close();

    expect(client.isOpen).toBe(false);
  });

  it("checks Redis readiness with PING", async () => {
    const limiter = new RedisFixedWindowRateLimiter(new FakeRedisClient(), 1, 1000);

    await expect(limiter.checkHealth()).resolves.toBeUndefined();
  });
});
