import { describe, expect, it } from "vitest";
import {
  AddProviderKeyRequestSchema,
  ChatCompletionRequestSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  RatedUsageSchema,
  RevenueRuleSchema,
  UsageEventSchema,
  isCloudSafeBaseUrl
} from "../src/index";

describe("shared schemas", () => {
  it("validates session request and response payloads", () => {
    expect(
      CreateSessionRequestSchema.parse({
        public_app_id: "app_pub_demo",
        external_user_id: "user_123",
        feature_key: "customer_reply",
        metadata: { locale: "zh-CN" }
      })
    ).toMatchObject({
      public_app_id: "app_pub_demo",
      external_user_id: "user_123"
    });

    expect(
      CreateSessionResponseSchema.parse({
        session_token: "mf_sess_abc123",
        expires_in: 3600,
        gateway_base_url: "https://gateway.modelfaucet.dev/v1",
        available_modes: ["platform", "byok", "local"],
        wallet_balance_usd: "10.00000000"
      })
    ).toMatchObject({
      session_token: "mf_sess_abc123",
      wallet_balance_usd: "10.00000000"
    });
  });

  it("validates OpenAI-compatible chat completion requests", () => {
    const parsed = ChatCompletionRequestSchema.parse({
      model: "auto:customer_reply",
      messages: [{ role: "user", content: "Generate a customer reply." }],
      metadata: { feature_key: "customer_reply" }
    });

    expect(parsed.stream).toBe(false);
    expect(parsed.messages[0]?.role).toBe("user");
  });

  it("validates provider-key requests without allowing private network base URLs", () => {
    const parsed = AddProviderKeyRequestSchema.parse({
      provider: "openai",
      api_key: "sk-test",
      base_url: "https://api.openai.com/v1",
      budget_limit_usd: "20.00"
    });

    expect(parsed.models_allowed).toEqual([]);
    expect(parsed.priority).toBe(100);
    expect(isCloudSafeBaseUrl("https://api.openai.com/v1")).toBe(true);

    const blockedBaseUrls = [
      "http://localhost:11434/v1",
      "http://127.0.0.1:11434/v1",
      "http://0.0.0.0:11434/v1",
      "http://10.1.2.3:8000/v1",
      "http://100.64.0.1:8000/v1",
      "http://172.16.0.1:8000/v1",
      "http://172.31.255.255:8000/v1",
      "http://192.168.1.20:8000/v1",
      "http://169.254.169.254/latest/meta-data",
      "http://metadata.google.internal/computeMetadata/v1",
      "http://[::1]:11434/v1",
      "http://[::]:11434/v1",
      "http://[fc00::1]:11434/v1",
      "http://[fd00::1]:11434/v1",
      "http://[fe80::1]:11434/v1",
      "http://[::ffff:127.0.0.1]:11434/v1",
      "http://2130706433:11434/v1",
      "http://0x7f000001:11434/v1",
      "http://0177.0.0.1:11434/v1"
    ];

    for (const baseUrl of blockedBaseUrls) {
      expect(
        AddProviderKeyRequestSchema.safeParse({
          provider: "openai",
          api_key: "sk-test",
          base_url: baseUrl
        }).success
      ).toBe(false);
    }
  });

  it("rejects invalid usage and revenue payloads", () => {
    expect(
      UsageEventSchema.safeParse({
        request_id: "req_abc",
        app_id: "app_123",
        developer_id: "dev_123",
        route_mode: "platform",
        model: "auto-text",
        input_tokens: -1,
        output_tokens: 10
      }).success
    ).toBe(false);

    expect(
      RevenueRuleSchema.safeParse({
        markup_percent: 30,
        channel_share_bps: 10001
      }).success
    ).toBe(false);
  });

  it("validates rated usage payloads", () => {
    expect(
      RatedUsageSchema.parse({
        request_id: "req_abc",
        route_mode: "byok",
        input_tokens: 100,
        output_tokens: 50,
        cached_tokens: 0,
        upstream_cost_usd: "0.00000000",
        retail_price_usd: "0.00000000",
        gross_margin_usd: "0.00000000",
        channel_revenue_usd: "0.00000000",
        platform_revenue_usd: "0.00000000"
      }).route_mode
    ).toBe("byok");
  });
});
