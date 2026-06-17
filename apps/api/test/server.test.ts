import { describe, expect, it } from "vitest";
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
        }
      },
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "@modelfaucet/api"
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
      gatewayBaseUrl: "http://localhost:3002/v1",
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
      gateway_base_url: "http://localhost:3002/v1",
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

  it("rejects invalid session payloads", async () => {
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession(): Promise<CreateVirtualSessionResult> {
          throw new Error("not used");
        }
      },
      gatewayBaseUrl: "http://localhost:3002/v1",
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
      async getAppUsage(publicAppId) {
        expect(publicAppId).toBe("app_pub_demo");
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
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/apps/app_pub_demo/usage",
      headers: {
        origin: "http://127.0.0.1:5173"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:5173"
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
});
