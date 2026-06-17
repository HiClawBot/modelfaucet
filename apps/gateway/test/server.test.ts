import { ModelFaucetError } from "@modelfaucet/shared";
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
    expect(response.json()).toEqual({
      ok: true,
      service: "@modelfaucet/gateway"
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
