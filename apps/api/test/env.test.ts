import { describe, expect, it } from "vitest";
import { loadApiEnv } from "../src/index";

const baseEnv = {
  DATABASE_URL: "postgresql://example",
  SECRET_ENCRYPTION_KEY: "dev_32_bytes_replace_me_replace_me"
};

describe("api env security defaults", () => {
  it("keeps development CORS compatible when no allowlist is configured", () => {
    expect(loadApiEnv(baseEnv).corsOrigins).toBe(true);
  });

  it("requires an explicit CORS allowlist in production", () => {
    expect(() =>
      loadApiEnv({
        ...baseEnv,
        NODE_ENV: "production"
      })
    ).toThrow("API_CORS_ORIGINS is required in production.");

    expect(() =>
      loadApiEnv({
        ...baseEnv,
        NODE_ENV: "production",
        API_CORS_ORIGINS: "*"
      })
    ).toThrow("API_CORS_ORIGINS must not be '*' in production.");
  });

  it("parses production CORS origins as an exact allowlist", () => {
    expect(
      loadApiEnv({
        ...baseEnv,
        NODE_ENV: "production",
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
});
