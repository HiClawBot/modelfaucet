import { describe, expect, it } from "vitest";
import {
  calculateTokenCostUsd,
  formatMoneyUnits,
  parseMoneyToUnits,
  pricePlatformUsage,
  priceZeroUpstreamUsage,
  splitAmountByBps
} from "../src/index";

describe("pricing helpers", () => {
  it("round-trips fixed precision USD strings", () => {
    expect(formatMoneyUnits(parseMoneyToUnits("12.3456"))).toBe("12.34560000");
  });

  it("calculates platform markup and revenue share without floating point drift", () => {
    const rated = pricePlatformUsage({
      requestId: "req_platform",
      inputTokens: 100,
      outputTokens: 50,
      upstreamCostUsd: "1.00000000",
      markupPercent: 30,
      channelShareBps: 4000
    });

    expect(rated).toMatchObject({
      upstream_cost_usd: "1.00000000",
      retail_price_usd: "1.30000000",
      gross_margin_usd: "0.30000000",
      channel_revenue_usd: "0.12000000",
      platform_revenue_usd: "0.18000000"
    });
  });

  it("calculates token-priced provider cost with 8-decimal round-up", () => {
    expect(
      calculateTokenCostUsd({
        inputTokens: 10,
        outputTokens: 20,
        inputPricePer1mTokensUsd: "1.00000000",
        outputPricePer1mTokensUsd: "2.00000000"
      })
    ).toBe("0.00005000");

    expect(
      calculateTokenCostUsd({
        inputTokens: 1,
        outputTokens: 0,
        inputPricePer1mTokensUsd: "0.00000001",
        outputPricePer1mTokensUsd: "0.00000000"
      })
    ).toBe("0.00000001");
  });

  it("uses the cached-token price and rejects cached counts above input", () => {
    expect(
      calculateTokenCostUsd({
        inputTokens: 100,
        outputTokens: 0,
        cachedTokens: 40,
        inputPricePer1mTokensUsd: "10.00000000",
        outputPricePer1mTokensUsd: "0.00000000",
        cachedPricePer1mTokensUsd: "2.00000000"
      })
    ).toBe("0.00068000");

    expect(() =>
      calculateTokenCostUsd({
        inputTokens: 1,
        outputTokens: 0,
        cachedTokens: 2,
        inputPricePer1mTokensUsd: "1.00000000",
        outputPricePer1mTokensUsd: "1.00000000"
      })
    ).toThrow("Cached token count must not exceed input token count");
  });

  it("keeps BYOK and local routes at zero upstream platform cost", () => {
    expect(
      priceZeroUpstreamUsage({
        requestId: "req_byok",
        routeMode: "byok",
        inputTokens: 100,
        outputTokens: 50
      }).upstream_cost_usd
    ).toBe("0.00000000");

    expect(
      priceZeroUpstreamUsage({
        requestId: "req_local",
        routeMode: "local",
        inputTokens: 100,
        outputTokens: 50,
        explicitGatewayFeeUsd: "0.01000000",
        channelShareBps: 5000
      })
    ).toMatchObject({
      upstream_cost_usd: "0.00000000",
      retail_price_usd: "0.01000000",
      channel_revenue_usd: "0.00500000",
      platform_revenue_usd: "0.00500000"
    });
  });

  it("splits amounts by basis points", () => {
    expect(splitAmountByBps("10.00000000", 2500)).toEqual({
      share_usd: "2.50000000",
      remainder_usd: "7.50000000"
    });
  });
});
