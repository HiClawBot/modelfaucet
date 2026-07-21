import { describe, expect, it } from "vitest";
import { InMemoryMetrics, InMemoryRateLimiter } from "@modelfaucet/shared";
import { buildApiServer, hashExternalUserId, hashSessionToken } from "../src/index";
import type {
  DashboardRepository,
  CreateVirtualSessionInput,
  CreateVirtualSessionResult,
  SessionRepository
} from "../src/index";

function requireCaptured(input: CreateVirtualSessionInput | undefined): CreateVirtualSessionInput {
  if (input === undefined) {
    throw new Error("Expected repository input to be captured");
  }

  return input;
}

describe("api server", () => {
  it("returns health status", async () => {
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession(): Promise<CreateVirtualSessionResult> {
          throw new Error("not used");
        },
        async checkHealth() {}
      },
      rateLimiter: new InMemoryRateLimiter(10, 1000),
      sessionRateLimiter: new InMemoryRateLimiter(10, 1000),
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.json()).toEqual({
      ok: true,
      service: "@modelfaucet/api"
    });
  });

  it("returns readiness and metrics", async () => {
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession(): Promise<CreateVirtualSessionResult> {
          throw new Error("not used");
        },
        async checkHealth() {}
      },
      rateLimiter: new InMemoryRateLimiter(10, 1000),
      sessionRateLimiter: new InMemoryRateLimiter(10, 1000),
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600,
      requestIdFactory: () => "req_api_test"
    });

    const ready = await server.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.headers["x-request-id"]).toBe("req_api_test");
    expect(ready.json()).toMatchObject({
      ok: true,
      checks: {
        database: "ok",
        rate_limit: "ok",
        session_rate_limit: "ok"
      }
    });

    const metrics = await server.inject({ method: "GET", url: "/metrics" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain("modelfaucet_http_requests_total");
    expect(metrics.body).toContain('service="@modelfaucet/api"');
  });

  it("returns 503 readiness without leaking dependency errors", async () => {
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession(): Promise<CreateVirtualSessionResult> {
          throw new Error("not used");
        },
        async checkHealth() {
          throw new Error("postgresql://user:secret@db.internal/private");
        }
      },
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600
    });

    const ready = await server.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({
      ok: false,
      checks: { database: "unavailable" }
    });
    expect(ready.body).not.toContain("secret");
    expect(ready.body).not.toContain("db.internal");
  });

  it("protects metrics and collapses dynamic and unknown route labels", async () => {
    const metrics = new InMemoryMetrics();
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession(): Promise<CreateVirtualSessionResult> {
          throw new Error("not used");
        }
      },
      metrics,
      metricsToken: "mf_metrics_test",
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600
    });

    await server.inject({ method: "GET", url: "/v1/apps/app_sensitive_123/usage" });
    await server.inject({ method: "GET", url: "/random/attacker-value-1" });
    await server.inject({ method: "GET", url: "/random/attacker-value-2" });

    const unauthorized = await server.inject({ method: "GET", url: "/metrics" });
    expect(unauthorized.statusCode).toBe(401);
    const authorized = await server.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer mf_metrics_test" }
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.body).toContain('route="/v1/apps/:publicAppId/usage"');
    expect(authorized.body).not.toContain("app_sensitive_123");
    expect(authorized.body).toContain('route="/__unmatched__"');
    expect(authorized.body).not.toContain("attacker-value");
  });

  it("uses an exact CORS allowlist when configured", async () => {
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession(): Promise<CreateVirtualSessionResult> {
          throw new Error("not used");
        }
      },
      corsOrigins: ["https://app.example"],
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600
    });

    const allowed = await server.inject({
      method: "GET",
      url: "/health",
      headers: {
        origin: "https://app.example"
      }
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example");

    const blocked = await server.inject({
      method: "GET",
      url: "/health",
      headers: {
        origin: "https://evil.example"
      }
    });
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("adds request ids to errors and applies rate limits", async () => {
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession(): Promise<CreateVirtualSessionResult> {
          throw new Error("not used");
        }
      },
      rateLimiter: new InMemoryRateLimiter(1, 1000),
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600,
      requestIdFactory: () => "req_api_limited"
    });

    const invalid = await server.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        public_app_id: "app_pub_demo"
      }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: {
        request_id: "req_api_limited"
      }
    });

    const limited = await server.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        public_app_id: "app_pub_demo"
      }
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.json()).toMatchObject({
      error: {
        code: "rate_limited",
        request_id: "req_api_limited"
      }
    });
  });

  it("creates sessions with hashed external user ids and token hashes", async () => {
    let captured: CreateVirtualSessionInput | undefined;
    const repository: SessionRepository = {
      async createVirtualSession(input) {
        captured = input;
        return {
          sessionId: "sess_test",
          endUserId: "usr_test",
          walletBalanceUsd: "10.00000000",
          availableModes: ["platform", "byok", "local"]
        };
      }
    };
    const server = buildApiServer({
      sessionRepository: repository,
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600,
      tokenFactory: () => "mf_sess_testtoken",
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        public_app_id: "app_pub_demo",
        external_user_id: "demo-user-1",
        feature_key: "customer_reply",
        metadata: { plan: "free" }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      session_token: "mf_sess_testtoken",
      expires_in: 3600,
      gateway_base_url: "http://localhost:3202/v1",
      available_modes: ["platform", "byok", "local"],
      wallet_balance_usd: "10.00000000"
    });

    const saved = requireCaptured(captured);
    expect(saved.publicAppId).toBe("app_pub_demo");
    expect(saved.externalUserHash).toBe(hashExternalUserId("demo-user-1"));
    expect(saved.externalUserHash).not.toContain("demo-user-1");
    expect(saved.tokenHash).toBe(hashSessionToken("mf_sess_testtoken"));
    expect(saved.tokenHash).not.toBe("mf_sess_testtoken");
    expect(saved.featureKey).toBe("customer_reply");
    expect(saved.expiresAt.toISOString()).toBe("2026-06-17T01:00:00.000Z");
  });

  it("applies an app-and-IP session creation limit before repository work", async () => {
    let calls = 0;
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession() {
          calls += 1;
          return {
            sessionId: "session_limited",
            endUserId: "user_limited",
            walletBalanceUsd: "1.00000000",
            availableModes: ["platform"]
          };
        }
      },
      sessionRateLimiter: new InMemoryRateLimiter(1, 60_000),
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600,
      tokenFactory: () => "mf_sess_limited"
    });
    const request = {
      method: "POST" as const,
      url: "/v1/sessions",
      payload: {
        public_app_id: "app_limited",
        external_user_id: "pilot-user"
      }
    };

    expect((await server.inject(request)).statusCode).toBe(200);
    const limited = await server.inject(request);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: "rate_limited" } });
    expect(calls).toBe(1);
  });

  it("rejects invalid session payloads", async () => {
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession(): Promise<CreateVirtualSessionResult> {
          throw new Error("not used");
        }
      },
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        public_app_id: "app_pub_demo"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_request"
      }
    });
  });

  it("returns app usage summaries for the dashboard", async () => {
    const dashboardRepository: DashboardRepository = {
      async getAppUsage(input) {
        expect(input).toEqual({
          publicAppId: "app_pub_demo",
          developerId: undefined,
          limit: 25,
          cursor: undefined
        });
        return {
          public_app_id: "app_pub_demo",
          app_name: "CRM Demo",
          total_calls: 1,
          total_input_tokens: 12,
          total_output_tokens: 8,
          total_retail_price_usd: "0.00013000",
          total_developer_revenue_usd: "0.00005200",
          usage: [
            {
              request_id: "req_test",
              feature_key: "customer_reply",
              route_mode: "platform",
              provider: "litellm",
              model: "auto-text",
              input_tokens: 12,
              output_tokens: 8,
              retail_price_usd: "0.00013000",
              channel_revenue_usd: "0.00005200",
              created_at: "2026-06-17T00:00:00.000Z"
            }
          ]
        };
      }
    };
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession(): Promise<CreateVirtualSessionResult> {
          throw new Error("not used");
        }
      },
      dashboardRepository,
      developerAdminToken: "mf_admin_dev",
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/apps/app_pub_demo/usage?limit=25",
      headers: {
        origin: "http://127.0.0.1:3203",
        authorization: "Bearer mf_admin_dev"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:3203"
    );
    expect(response.json()).toMatchObject({
      public_app_id: "app_pub_demo",
      total_calls: 1,
      total_input_tokens: 12,
      total_output_tokens: 8,
      total_retail_price_usd: "0.00013000",
      total_developer_revenue_usd: "0.00005200",
      usage: [
        {
          request_id: "req_test",
          feature_key: "customer_reply"
        }
      ]
    });
  });

  it("rejects unauthenticated app usage reads", async () => {
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession(): Promise<CreateVirtualSessionResult> {
          throw new Error("not used");
        }
      },
      dashboardRepository: {
        async getAppUsage() {
          throw new Error("usage should not be read without auth");
        }
      },
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/apps/app_pub_demo/usage"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "invalid_session" } });
  });
});
