import { describe, expect, it } from "vitest";
import {
  LiteLlmClient,
  buildLiteLlmChatCompletionsUrl,
  buildLiteLlmHealthUrl,
  loadGatewayEnv
} from "../src/index";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("LiteLlmClient", () => {
  it("routes auto feature models to auto-text and forwards the server-side master key", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const client = new LiteLlmClient({
      baseUrl: "https://litellm.example",
      masterKey: "sk-litellm-dev-master-key",
      fetch: async (input, init) => {
        calls.push({ input, init });
        return jsonResponse({
          model: "auto-text",
          choices: [{ message: { role: "assistant", content: "Mock LiteLLM response" } }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 7,
            total_tokens: 19
          }
        });
      }
    });

    const result = await client.createChatCompletion({
      request: {
        model: "auto:customer_reply",
        messages: [{ role: "user", content: "Write a customer reply." }]
      },
      featureKey: "customer_reply"
    });

    expect(result).toMatchObject({
      provider: "litellm",
      model: "auto-text",
      messageContent: "Mock LiteLLM response",
      promptTokens: 12,
      completionTokens: 7
    });
    expect(String(calls[0]?.input)).toBe("https://litellm.example/v1/chat/completions");
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: "Bearer sk-litellm-dev-master-key"
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      model: "auto-text"
    });
  });

  it("falls back to estimated token counts when provider usage is missing", async () => {
    const client = new LiteLlmClient({
      baseUrl: "https://litellm.example/v1",
      masterKey: "sk-litellm-dev-master-key",
      fetch: async () =>
        jsonResponse({
          choices: [{ message: { role: "assistant", content: "Fallback usage" } }]
        })
    });

    const result = await client.createChatCompletion({
      request: {
        model: "gpt-test",
        messages: [{ role: "user", content: "abcdabcd" }]
      }
    });

    expect(result.model).toBe("gpt-test");
    expect(result.promptTokens).toBe(2);
    expect(result.completionTokens).toBeGreaterThan(0);
    expect(result.usageSource).toBe("estimated");
    expect(result.usageWarnings).toEqual([
      "provider_prompt_tokens_missing",
      "provider_completion_tokens_missing"
    ]);
  });

  it("reconciles partial provider token usage with total tokens", async () => {
    const client = new LiteLlmClient({
      baseUrl: "https://litellm.example/v1",
      masterKey: "sk-litellm-dev-master-key",
      fetch: async () =>
        jsonResponse({
          model: "gpt-test",
          choices: [{ message: { role: "assistant", content: "Reconciled usage" } }],
          usage: {
            prompt_tokens: 3,
            total_tokens: 11
          }
        })
    });

    const result = await client.createChatCompletion({
      request: {
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }]
      }
    });

    expect(result.promptTokens).toBe(3);
    expect(result.completionTokens).toBe(8);
    expect(result.usageSource).toBe("reconciled");
  });

  it("retries retryable provider failures before succeeding", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const client = new LiteLlmClient({
      baseUrl: "https://litellm.example",
      masterKey: "sk-litellm-dev-master-key",
      maxRetries: 1,
      retryDelayMs: 1,
      fetch: async (input, init) => {
        calls.push({ input, init });
        if (calls.length === 1) {
          return jsonResponse({ error: { message: "temporarily unavailable" } }, 503);
        }

        return jsonResponse({
          model: "auto-text",
          choices: [{ message: { role: "assistant", content: "Recovered" } }],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 2,
            total_tokens: 6
          }
        });
      }
    });

    const result = await client.createChatCompletion({
      request: {
        model: "auto:customer_reply",
        messages: [{ role: "user", content: "Retry this" }]
      }
    });

    expect(calls).toHaveLength(2);
    expect(result.messageContent).toBe("Recovered");
    expect(result.attempts).toMatchObject([
      { attempt: 1, statusCode: 503, retryable: true },
      { attempt: 2, statusCode: 200, retryable: false }
    ]);
  });

  it("uses server-side BYOK credentials without the LiteLLM master key", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const client = new LiteLlmClient({
      baseUrl: "https://litellm.example",
      masterKey: "sk-litellm-dev-master-key",
      fetch: async (input, init) => {
        calls.push({ input, init });
        return jsonResponse({
          model: "gpt-4.1-mini",
          choices: [{ message: { role: "assistant", content: "BYOK response" } }],
          usage: {
            prompt_tokens: 9,
            completion_tokens: 4
          }
        });
      }
    });

    const result = await client.createChatCompletion({
      request: {
        model: "auto:customer_reply",
        messages: [{ role: "user", content: "Use BYOK" }]
      },
      featureKey: "customer_reply",
      providerCredential: {
        provider: "openai",
        apiKey: "sk-user-owned-key",
        baseUrl: "https://api.openai.com/v1",
        modelsAllowed: ["gpt-4.1-mini"]
      }
    });

    expect(result).toMatchObject({
      provider: "openai",
      model: "gpt-4.1-mini",
      messageContent: "BYOK response"
    });
    expect(String(calls[0]?.input)).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: "Bearer sk-user-owned-key"
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      model: "gpt-4.1-mini"
    });
  });

  it("rejects private BYOK provider base URLs", async () => {
    const client = new LiteLlmClient({
      baseUrl: "https://litellm.example",
      masterKey: "sk-litellm-dev-master-key",
      fetch: async () => jsonResponse({})
    });

    await expect(
      client.createChatCompletion({
        request: {
          model: "gpt-test",
          messages: [{ role: "user", content: "Hello" }]
        },
        providerCredential: {
          provider: "openai_compatible",
          apiKey: "sk-user-owned-key",
          baseUrl: "http://127.0.0.1:11434/v1",
          modelsAllowed: []
        }
      })
    ).rejects.toThrow("BYOK provider base URL is not allowed for cloud routing.");
  });

  it("normalizes LiteLLM chat completion URLs", () => {
    expect(buildLiteLlmChatCompletionsUrl("https://litellm.example")).toBe(
      "https://litellm.example/v1/chat/completions"
    );
    expect(buildLiteLlmChatCompletionsUrl("https://litellm.example/v1")).toBe(
      "https://litellm.example/v1/chat/completions"
    );
  });

  it("normalizes LiteLLM health URLs", () => {
    expect(buildLiteLlmHealthUrl("https://litellm.example")).toBe(
      "https://litellm.example/health"
    );
    expect(buildLiteLlmHealthUrl("https://litellm.example/v1")).toBe(
      "https://litellm.example/health"
    );
  });

  it("checks provider health without exposing secrets", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const client = new LiteLlmClient({
      baseUrl: "https://litellm.example",
      masterKey: "sk-litellm-dev-master-key",
      fetch: async (input, init) => {
        calls.push({ input, init });
        return jsonResponse({ ok: true });
      }
    });

    await expect(client.checkHealth()).resolves.toMatchObject({
      ok: true,
      provider: "litellm",
      statusCode: 200
    });
    expect(String(calls[0]?.input)).toBe("https://litellm.example/health");
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: "Bearer sk-litellm-dev-master-key"
    });
  });

  it("rejects localhost LiteLLM URLs in production", () => {
    expect(() =>
      loadGatewayEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://example",
        LITELLM_BASE_URL: "http://localhost:4000",
        LITELLM_MASTER_KEY: "sk-litellm-dev-master-key",
        SECRET_ENCRYPTION_KEY: "dev_32_bytes_replace_me_replace_me"
      })
    ).toThrow("Production LiteLLM base URL must not point to localhost or a private LAN");
  });
});
