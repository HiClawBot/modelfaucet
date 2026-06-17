import { describe, expect, it } from "vitest";
import {
  LiteLlmClient,
  buildLiteLlmChatCompletionsUrl,
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
