import { describe, expect, it } from "vitest";
import { rateUsage } from "../src/index";
import type { ModelPrice, RevenueRule, UsageEvent } from "@modelfaucet/shared";

const price: ModelPrice = {
  input_price_per_1m_tokens_usd: "1.00000000",
  output_price_per_1m_tokens_usd: "3.00000000",
  cached_price_per_1m_tokens_usd: "0.25000000"
};

const revenueRule: RevenueRule = {
  markup_percent: 30,
  channel_share_bps: 4000
};

function usageEvent(input: Partial<UsageEvent>): UsageEvent {
  return {
    request_id: "req_test",
    app_id: "app_123",
    developer_id: "dev_123",
    end_user_id: "usr_123",
    feature_key: "customer_reply",
    route_mode: "platform",
    provider: "mock",
    model: "auto-text",
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cached_tokens: 0,
    upstream_cost_usd: "0",
    retail_price_usd: "0",
    gross_margin_usd: "0",
    channel_revenue_usd: "0",
    platform_revenue_usd: "0",
    ...input
  };
}

describe("rateUsage", () => {
  it("rates platform usage with markup and channel share", () => {
    const rated = rateUsage(usageEvent({ route_mode: "platform" }), price, revenueRule);

    expect(rated).toMatchObject({
      route_mode: "platform",
      upstream_cost_usd: "4.00000000",
      retail_price_usd: "5.20000000",
      gross_margin_usd: "1.20000000",
      channel_revenue_usd: "0.48000000",
      platform_revenue_usd: "0.72000000"
    });
  });

  it("rates developer key usage with the same explicit pricing rule", () => {
    const rated = rateUsage(usageEvent({ route_mode: "developer_key" }), price, revenueRule);

    expect(rated).toMatchObject({
      route_mode: "developer_key",
      upstream_cost_usd: "4.00000000",
      retail_price_usd: "5.20000000"
    });
  });

  it("keeps BYOK upstream platform cost at zero", () => {
    const rated = rateUsage(
      usageEvent({ route_mode: "byok" }),
      price,
      {
        channel_share_bps: 0,
        explicit_gateway_fee_usd: "0.01000000"
      }
    );

    expect(rated).toMatchObject({
      route_mode: "byok",
      upstream_cost_usd: "0.00000000",
      retail_price_usd: "0.01000000"
    });
  });

  it("keeps local upstream platform cost at zero", () => {
    const rated = rateUsage(
      usageEvent({ route_mode: "local" }),
      price,
      {
        channel_share_bps: 5000,
        explicit_gateway_fee_usd: "0.02000000"
      }
    );

    expect(rated).toMatchObject({
      route_mode: "local",
      upstream_cost_usd: "0.00000000",
      retail_price_usd: "0.02000000",
      channel_revenue_usd: "0.01000000",
      platform_revenue_usd: "0.01000000"
    });
  });

  it("rejects negative token counts", () => {
    expect(() =>
      rateUsage(usageEvent({ input_tokens: -1 }), price, revenueRule)
    ).toThrow("Token counts must be non-negative integers");
  });

  it("rejects unknown route modes", () => {
    expect(() =>
      rateUsage(
        usageEvent({ route_mode: "unknown" as UsageEvent["route_mode"] }),
        price,
        revenueRule
      )
    ).toThrow("Unknown route mode");
  });
});
