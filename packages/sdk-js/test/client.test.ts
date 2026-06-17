import { describe, expect, it } from "vitest";
import { createFaucet, sdkPackage, type FaucetOptions, type FetchLike } from "../src/index";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("createFaucet", () => {
  it("creates sessions without sending provider API keys", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({
        session_token: "mf_sess_sdk",
        expires_in: 3600,
        gateway_base_url: "https://gateway.example/v1",
        available_modes: ["platform", "byok", "local"],
        wallet_balance_usd: "10.00000000"
      });
    };
    const options = {
      publicAppId: "app_pub_demo",
      user: { id: "demo-user" }
    } satisfies FaucetOptions;

    const faucet = createFaucet(options, { fetch: fetchImpl, now: () => 0 });
    const session = await faucet.createSession();

    expect(session.session_token).toBe("mf_sess_sdk");
    expect(sdkPackage.acceptsProviderApiKeysByDefault).toBe(false);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      public_app_id: "app_pub_demo",
      external_user_id: "demo-user"
    });
  });

  it("creates a session and calls the gateway", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ input, init });
      if (String(input).endsWith("/v1/sessions")) {
        return jsonResponse({
          session_token: "mf_sess_sdk",
          expires_in: 3600,
          gateway_base_url: "https://gateway.example/v1",
          available_modes: ["platform", "byok", "local"],
          wallet_balance_usd: "10.00000000"
        });
      }

      return jsonResponse({
        id: "chatcmpl_mf_req_sdk",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        modelfaucet: { request_id: "req_sdk" }
      });
    };

    const faucet = createFaucet(
      {
        publicAppId: "app_pub_demo",
        user: { id: "demo-user" }
      },
      { fetch: fetchImpl, now: () => 0 }
    );
    const result = await faucet.chat({
      feature: "customer_reply",
      input: { ticket_text: "Late shipment" }
    });

    expect(result).toMatchObject({
      id: "chatcmpl_mf_req_sdk"
    });
    expect(String(calls[1]?.input)).toBe("https://gateway.example/v1/chat/completions");
    expect(calls[1]?.init?.headers).toMatchObject({
      authorization: "Bearer mf_sess_sdk"
    });
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
      model: "auto:customer_reply",
      metadata: { feature_key: "customer_reply" }
    });
  });

  it("runs command-style feature calls with normalized text and usage", async () => {
    const fetchImpl: FetchLike = async (input) => {
      if (String(input).endsWith("/v1/sessions")) {
        return jsonResponse({
          session_token: "mf_sess_sdk",
          expires_in: 3600,
          gateway_base_url: "https://gateway.example/v1",
          available_modes: ["platform"],
          wallet_balance_usd: "10.00000000"
        });
      }

      return jsonResponse({
        id: "chatcmpl_mf_req_sdk",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Use a warmer tone." } }],
        usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
        modelfaucet: { request_id: "req_sdk", route_mode: "platform" }
      });
    };
    const faucet = createFaucet(
      {
        publicAppId: "app_pub_demo",
        user: { id: "demo-user" }
      },
      { fetch: fetchImpl, now: () => 0 }
    );

    await expect(
      faucet.runFeature({
        feature: "rewrite_reply",
        input: { tone: "warm", draft: "No." }
      })
    ).resolves.toEqual({
      text: "Use a warmer tone.",
      raw: {
        id: "chatcmpl_mf_req_sdk",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "Use a warmer tone." } }],
        usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
        modelfaucet: { request_id: "req_sdk", route_mode: "platform" }
      },
      usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
      modelfaucet: { request_id: "req_sdk", route_mode: "platform" }
    });
  });

  it("refreshes expired sessions before chat calls", async () => {
    let nowMs = 0;
    let sessionCount = 0;
    const fetchImpl: FetchLike = async (input) => {
      if (String(input).endsWith("/v1/sessions")) {
        sessionCount += 1;
        return jsonResponse({
          session_token: `mf_sess_sdk_${sessionCount}`,
          expires_in: 10,
          gateway_base_url: "https://gateway.example/v1",
          available_modes: ["platform"],
          wallet_balance_usd: "10.00000000"
        });
      }

      return jsonResponse({
        id: "chatcmpl_mf_req_sdk",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        modelfaucet: { request_id: "req_sdk" }
      });
    };
    const faucet = createFaucet(
      {
        publicAppId: "app_pub_demo",
        user: { id: "demo-user" }
      },
      { fetch: fetchImpl, now: () => nowMs }
    );

    await faucet.chat({ feature: "customer_reply", input: "hello" });
    nowMs = 20_000;
    await faucet.chat({ feature: "customer_reply", input: "hello again" });

    expect(sessionCount).toBe(2);
  });

  it("detects the local bridge", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({
        ok: true,
        version: "0.1.0",
        listening: "127.0.0.1:8787"
      });
    const faucet = createFaucet(
      {
        publicAppId: "app_pub_demo",
        user: { id: "demo-user" }
      },
      { fetch: fetchImpl }
    );

    await expect(faucet.local.detectBridge()).resolves.toEqual({
      available: true,
      baseUrl: "http://127.0.0.1:8787",
      health: {
        ok: true,
        version: "0.1.0",
        listening: "127.0.0.1:8787"
      }
    });
  });

  it("lists local bridge models", async () => {
    const fetchImpl: FetchLike = async (input) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/models");
      return jsonResponse({
        items: [
          {
            id: "ollama:qwen2.5:7b",
            provider: "ollama",
            endpoint_id: "ollama",
            capabilities: ["chat", "json"]
          }
        ]
      });
    };
    const faucet = createFaucet(
      {
        publicAppId: "app_pub_demo",
        user: { id: "demo-user" }
      },
      { fetch: fetchImpl }
    );

    await expect(faucet.local.listModels()).resolves.toEqual({
      items: [
        {
          id: "ollama:qwen2.5:7b",
          provider: "ollama",
          endpoint_id: "ollama",
          capabilities: ["chat", "json"]
        }
      ]
    });
  });

  it("diagnoses the local bridge and model availability", async () => {
    const fetchImpl: FetchLike = async (input) => {
      if (String(input).endsWith("/health")) {
        return jsonResponse({
          ok: true,
          version: "0.1.0",
          listening: "127.0.0.1:8787"
        });
      }

      return jsonResponse({
        items: [
          {
            id: "ollama:qwen2.5:7b",
            provider: "ollama",
            endpoint_id: "ollama",
            capabilities: ["chat", "json"]
          }
        ]
      });
    };
    const faucet = createFaucet(
      {
        publicAppId: "app_pub_demo",
        user: { id: "demo-user" }
      },
      { fetch: fetchImpl }
    );

    await expect(faucet.local.diagnose()).resolves.toMatchObject({
      available: true,
      baseUrl: "http://127.0.0.1:8787",
      models: [
        {
          id: "ollama:qwen2.5:7b"
        }
      ],
      problems: []
    });
  });

  it("calls the local bridge and reports local usage", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      calls.push({ input, init });
      if (String(input).endsWith("/v1/chat/completions")) {
        return jsonResponse({
          id: "chatcmpl_local",
          object: "chat.completion",
          model: "qwen2.5:7b",
          choices: [{ message: { role: "assistant", content: "local ok" } }],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 3,
            total_tokens: 8
          }
        });
      }

      return jsonResponse({ ok: true });
    };
    const faucet = createFaucet(
      {
        publicAppId: "app_pub_demo",
        user: { id: "demo-user" }
      },
      { fetch: fetchImpl, now: () => 0 }
    );

    const result = await faucet.chat({
      feature: "customer_reply",
      input: "hello",
      model: "ollama:qwen2.5:7b",
      routeMode: "local"
    });

    expect(result).toMatchObject({
      id: "chatcmpl_local",
      modelfaucet: {
        route_mode: "local",
        feature_key: "customer_reply"
      }
    });
    expect(String(calls[0]?.input)).toBe("http://127.0.0.1:8787/v1/chat/completions");
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      model: "ollama:qwen2.5:7b",
      metadata: {
        feature_key: "customer_reply",
        route_mode: "local"
      }
    });
    expect(String(calls[1]?.input)).toBe("http://127.0.0.1:8787/usage/report");
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
      app_id: "app_pub_demo",
      end_user_id_hash:
        "sha256:cebf292c038fdcd2de5f7ac62c3b81bcfe4efc535383031d762b06b26cfabea2",
      feature_key: "customer_reply",
      route_mode: "local",
      provider: "ollama",
      model: "qwen2.5:7b",
      input_tokens: 5,
      output_tokens: 3
    });
    expect(calls.some((call) => String(call.input).endsWith("/v1/sessions"))).toBe(false);
  });

  it("queues local usage reports when reporting is temporarily unavailable", async () => {
    let usageReportAttempts = 0;
    const fetchImpl: FetchLike = async (input) => {
      if (String(input).endsWith("/v1/chat/completions")) {
        return jsonResponse({
          id: "chatcmpl_local",
          object: "chat.completion",
          model: "qwen2.5:7b",
          choices: [{ message: { role: "assistant", content: "local ok" } }],
          usage: {
            prompt_tokens: 5,
            completion_tokens: 3,
            total_tokens: 8
          }
        });
      }

      usageReportAttempts += 1;
      return usageReportAttempts === 1
        ? jsonResponse({ error: { code: "cloud_offline" } }, 503)
        : jsonResponse({ ok: true });
    };
    const faucet = createFaucet(
      {
        publicAppId: "app_pub_demo",
        user: { id: "demo-user" }
      },
      { fetch: fetchImpl, now: () => 0 }
    );

    const result = await faucet.chat({
      feature: "customer_reply",
      input: "hello",
      model: "ollama:qwen2.5:7b",
      routeMode: "local"
    });

    expect(result).toMatchObject({
      modelfaucet: {
        usage_report_status: "queued"
      }
    });
    expect(faucet.local.pendingUsageReports()).toHaveLength(1);
    await expect(faucet.local.flushUsageReports()).resolves.toEqual({
      flushed: 1,
      pending: 0
    });
    expect(faucet.local.pendingUsageReports()).toHaveLength(0);
  });
});
