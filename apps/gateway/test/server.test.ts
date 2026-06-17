import { InMemoryRateLimiter, ModelFaucetError } from "@modelfaucet/shared";
import { describe, expect, it } from "vitest";
import { buildGatewayServer, hashSessionToken } from "../src/index";
import type {
  CreateMockCompletionInput,
  MockCompletionRepository,
  MockCompletionResult
} from "../src/index";

function requireCaptured(input: CreateMockCompletionInput | undefined): CreateMockCompletionInput {
  if (input === undefined) {
    throw new Error("Expected gateway repository input to be captured");
  }

  return input;
}

const mockResult: MockCompletionResult = {
  requestId: "req_test",
  routeMode: "platform",
  featureKey: "customer_reply",
  model: "auto:customer_reply",
  messageContent: "This is a ModelFaucet mock response.",
  promptTokens: 12,
  completionTokens: 24,
  estimatedPriceUsd: "0.00013000"
};

const byokResult: MockCompletionResult = {
  ...mockResult,
  routeMode: "byok",
  estimatedPriceUsd: "0.00000000"
};

describe("gateway server", () => {
  it("returns health status", async () => {
    const server = buildGatewayServer({
      mockCompletionRepository: {
        async createMockCompletion(): Promise<MockCompletionResult> {
          throw new Error("not used");
        }
      }
    });

    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.json()).toEqual({
      ok: true,
      service: "@modelfaucet/gateway"
    });
  });

  it("returns readiness and metrics", async () => {
    const server = buildGatewayServer({
      mockCompletionRepository: {
        async createMockCompletion(): Promise<MockCompletionResult> {
          throw new Error("not used");
        }
      },
      requestIdFactory: () => "req_gateway_test"
    });

    const ready = await server.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.headers["x-request-id"]).toBe("req_gateway_test");
    expect(ready.json()).toMatchObject({
      ok: true,
      checks: {
        repository: "configured"
      }
    });

    const metrics = await server.inject({ method: "GET", url: "/metrics" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain("modelfaucet_http_requests_total");
    expect(metrics.body).toContain('service="@modelfaucet/gateway"');
  });

  it("adds request ids to errors and applies rate limits", async () => {
    const server = buildGatewayServer({
      mockCompletionRepository: {
        async createMockCompletion(): Promise<MockCompletionResult> {
          throw new Error("not used");
        }
      },
      rateLimiter: new InMemoryRateLimiter(1, 1000),
      requestIdFactory: () => "req_gateway_limited"
    });

    const missingAuth = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "auto:customer_reply",
        messages: [{ role: "user", content: "Hello" }]
      }
    });
    expect(missingAuth.statusCode).toBe(401);
    expect(missingAuth.json()).toMatchObject({
      error: {
        request_id: "req_gateway_limited"
      }
    });

    const limited = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "auto:customer_reply",
        messages: [{ role: "user", content: "Hello" }]
      }
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      error: {
        code: "rate_limited",
        request_id: "req_gateway_limited"
      }
    });
  });

  it("returns provider health without checking user provider keys", async () => {
    const server = buildGatewayServer({
      mockCompletionRepository: {
        async createMockCompletion(): Promise<MockCompletionResult> {
          throw new Error("not used");
        },
        async checkProviderHealth() {
          return {
            ok: true,
            provider: "litellm",
            statusCode: 200,
            latencyMs: 8
          };
        }
      }
    });

    const response = await server.inject({ method: "GET", url: "/health/providers" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      providers: [{ provider: "litellm", statusCode: 200 }]
    });
  });

  it("returns an OpenAI-like mock response for a valid session", async () => {
    let captured: CreateMockCompletionInput | undefined;
    const repository: MockCompletionRepository = {
      async createMockCompletion(input) {
        captured = input;
        return mockResult;
      }
    };
    const server = buildGatewayServer({
      mockCompletionRepository: repository,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer mf_sess_testtoken"
      },
      payload: {
        model: "auto:customer_reply",
        messages: [{ role: "user", content: "Help me reply to a customer." }],
        metadata: { feature_key: "customer_reply" }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "chatcmpl_mf_req_test",
      object: "chat.completion",
      model: "auto:customer_reply",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant"
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 24,
        total_tokens: 36
      },
      modelfaucet: {
        request_id: "req_test",
        route_mode: "platform",
        feature_key: "customer_reply",
        estimated_price_usd: "0.00013000"
      }
    });

    const saved = requireCaptured(captured);
    expect(saved.sessionTokenHash).toBe(hashSessionToken("mf_sess_testtoken"));
    expect(saved.sessionTokenHash).not.toBe("mf_sess_testtoken");
  });

  it("returns BYOK route metadata when the repository selects BYOK", async () => {
    const repository: MockCompletionRepository = {
      async createMockCompletion() {
        return byokResult;
      }
    };
    const server = buildGatewayServer({
      mockCompletionRepository: repository,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer mf_sess_testtoken"
      },
      payload: {
        model: "auto:customer_reply",
        messages: [{ role: "user", content: "Help me reply to a customer." }],
        metadata: { feature_key: "customer_reply", route_mode: "byok" }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      modelfaucet: {
        route_mode: "byok",
        estimated_price_usd: "0.00000000"
      }
    });
  });

  it("rejects streaming requests until streaming ledger accounting is enabled", async () => {
    const repository: MockCompletionRepository = {
      async createMockCompletion() {
        throw new Error("not used");
      }
    };
    const server = buildGatewayServer({
      mockCompletionRepository: repository
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer mf_sess_testtoken"
      },
      payload: {
        model: "auto:customer_reply",
        stream: true,
        messages: [{ role: "user", content: "Help me reply to a customer." }],
        metadata: { feature_key: "customer_reply" }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_request",
        details: {
          streaming_supported: false
        }
      }
    });
  });

  it("rejects missing and expired sessions", async () => {
    const repository: MockCompletionRepository = {
      async createMockCompletion() {
        throw new ModelFaucetError({
          code: "expired_session",
          message: "The session token is expired.",
          statusCode: 401
        });
      }
    };
    const server = buildGatewayServer({
      mockCompletionRepository: repository
    });

    const missingAuth = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "auto:customer_reply",
        messages: [{ role: "user", content: "Hello" }]
      }
    });
    expect(missingAuth.statusCode).toBe(401);
    expect(missingAuth.json()).toMatchObject({ error: { code: "invalid_session" } });

    const expired = await server.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: "Bearer mf_sess_expired"
      },
      payload: {
        model: "auto:customer_reply",
        messages: [{ role: "user", content: "Hello" }]
      }
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json()).toMatchObject({ error: { code: "expired_session" } });
  });
});
