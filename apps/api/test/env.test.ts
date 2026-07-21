import { describe, expect, it } from "vitest";
import { loadApiEnv } from "../src/index";

const baseEnv = {
  DATABASE_URL: "postgresql://example",
  SECRET_ENCRYPTION_KEY: "dev_32_bytes_replace_me_replace_me"
};

const productionBaseEnv = {
  ...baseEnv,
  NODE_ENV: "production",
  DEVELOPER_ADMIN_TOKEN: "mf_test_developer_admin_token",
  ADMIN_TOKEN: "mf_test_operator_admin_token",
  METRICS_TOKEN: "mf_test_metrics_token",
  REDIS_URL: "redis://redis:3290",
  TRUST_PROXY_HOPS: "1",
  API_PLATFORM_ONLY: "1",
  API_ENABLE_STRIPE_PAYMENTS: "0",
  API_ENABLE_PAYOUTS: "0",
  API_ENABLE_PROVIDER_KEYS: "0",
  API_ENABLE_TEST_CREDITS: "0",
  API_REQUIRE_SESSION_ORIGIN: "1"
};

describe("api env security defaults", () => {
  it("keeps development CORS compatible when no allowlist is configured", () => {
    expect(loadApiEnv(baseEnv).corsOrigins).toBe(true);
  });

  it("requires an explicit CORS allowlist in production", () => {
    expect(() =>
      loadApiEnv({
        ...productionBaseEnv
      })
    ).toThrow("API_CORS_ORIGINS is required in production.");

    expect(() =>
      loadApiEnv({
        ...productionBaseEnv,
        API_CORS_ORIGINS: "*"
      })
    ).toThrow("API_CORS_ORIGINS must not be '*' in production.");
  });

  it("parses production CORS origins as an exact allowlist", () => {
    expect(
      loadApiEnv({
        ...productionBaseEnv,
        API_CORS_ORIGINS: "https://app.example,https://admin.example"
      }).corsOrigins
    ).toEqual(["https://app.example", "https://admin.example"]);
  });

  it("rejects invalid CORS origins", () => {
    expect(() =>
      loadApiEnv({
        ...baseEnv,
        API_CORS_ORIGINS: "https://app.example/path"
      })
    ).toThrow("API_CORS_ORIGINS contains an invalid origin");
  });

  it("parses REDIS_URL for distributed hosted rate limits", () => {
    expect(
      loadApiEnv({
        ...baseEnv,
        REDIS_URL: "redis://redis:3290"
      }).redisUrl
    ).toBe("redis://redis:3290");
  });

  it("requires Redis for production rate limiting", () => {
    const withoutRedis = Object.fromEntries(
      Object.entries(productionBaseEnv).filter(([key]) => key !== "REDIS_URL")
    );
    expect(() =>
      loadApiEnv({
        ...withoutRedis,
        API_CORS_ORIGINS: "https://app.example"
      })
    ).toThrow("REDIS_URL is required in production.");
  });

  it("loads production feature flags as a platform-only surface", () => {
    const env = loadApiEnv({
      ...productionBaseEnv,
      API_CORS_ORIGINS: "https://app.example"
    });

    expect(env).toMatchObject({
      platformOnly: true,
      enableStripePayments: false,
      enablePayouts: false,
      enableProviderKeys: false,
      enableTestCredits: false,
      requireSessionOrigin: true,
      trustProxyHops: 1
    });
  });
});
