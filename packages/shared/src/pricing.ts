import type { RatedUsage, RouteMode } from "./types";

const MONEY_SCALE = 100_000_000n;
const moneyPattern = /^(0|[1-9]\d*)(\.\d{1,8})?$/;

export type PlatformPricingInput = {
  requestId: string;
  routeMode?: Extract<RouteMode, "platform" | "developer_key">;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  upstreamCostUsd: string;
  markupPercent: number;
  channelShareBps: number;
};

export type ZeroUpstreamPricingInput = {
  requestId: string;
  routeMode: Extract<RouteMode, "byok" | "local">;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  explicitGatewayFeeUsd?: string;
  channelShareBps?: number;
};

export function parseMoneyToUnits(value: string): bigint {
  if (!moneyPattern.test(value)) {
    throw new Error(`Invalid money string: ${value}`);
  }

  const [wholePart = "0", fractionalPart = ""] = value.split(".");
  return BigInt(wholePart) * MONEY_SCALE + BigInt(fractionalPart.padEnd(8, "0"));
}

export function formatMoneyUnits(units: bigint): string {
  if (units < 0n) {
    throw new Error("Money amount cannot be negative");
  }

  const whole = units / MONEY_SCALE;
  const fractional = units % MONEY_SCALE;
  return `${whole.toString()}.${fractional.toString().padStart(8, "0")}`;
}

export function assertBasisPoints(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new Error("Basis points must be an integer between 0 and 10000");
  }
}

export function assertTokenCounts(inputTokens: number, outputTokens: number, cachedTokens = 0): void {
  for (const value of [inputTokens, outputTokens, cachedTokens]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("Token counts must be non-negative integers");
    }
  }
}

export function splitAmountByBps(amountUsd: string, shareBps: number): {
  share_usd: string;
  remainder_usd: string;
} {
  assertBasisPoints(shareBps);

  const amount = parseMoneyToUnits(amountUsd);
  const share = (amount * BigInt(shareBps)) / 10000n;
  return {
    share_usd: formatMoneyUnits(share),
    remainder_usd: formatMoneyUnits(amount - share)
  };
}

export function pricePlatformUsage(input: PlatformPricingInput): RatedUsage {
  assertTokenCounts(input.inputTokens, input.outputTokens, input.cachedTokens ?? 0);
  assertBasisPoints(input.channelShareBps);

  if (!Number.isFinite(input.markupPercent) || input.markupPercent < 0) {
    throw new Error("Markup percent must be a non-negative number");
  }

  const upstreamCost = parseMoneyToUnits(input.upstreamCostUsd);
  const markupBps = BigInt(Math.round(input.markupPercent * 100));
  const grossMargin = (upstreamCost * markupBps) / 10000n;
  const retailPrice = upstreamCost + grossMargin;
  const channelRevenue = (grossMargin * BigInt(input.channelShareBps)) / 10000n;
  const platformRevenue = grossMargin - channelRevenue;

  return {
    request_id: input.requestId,
    route_mode: input.routeMode ?? "platform",
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cached_tokens: input.cachedTokens ?? 0,
    upstream_cost_usd: formatMoneyUnits(upstreamCost),
    retail_price_usd: formatMoneyUnits(retailPrice),
    gross_margin_usd: formatMoneyUnits(grossMargin),
    channel_revenue_usd: formatMoneyUnits(channelRevenue),
    platform_revenue_usd: formatMoneyUnits(platformRevenue)
  };
}

export function priceZeroUpstreamUsage(input: ZeroUpstreamPricingInput): RatedUsage {
  assertTokenCounts(input.inputTokens, input.outputTokens, input.cachedTokens ?? 0);
  assertBasisPoints(input.channelShareBps ?? 0);

  const explicitFee = parseMoneyToUnits(input.explicitGatewayFeeUsd ?? "0");
  const channelRevenue = (explicitFee * BigInt(input.channelShareBps ?? 0)) / 10000n;
  const platformRevenue = explicitFee - channelRevenue;

  return {
    request_id: input.requestId,
    route_mode: input.routeMode,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cached_tokens: input.cachedTokens ?? 0,
    upstream_cost_usd: "0.00000000",
    retail_price_usd: formatMoneyUnits(explicitFee),
    gross_margin_usd: formatMoneyUnits(explicitFee),
    channel_revenue_usd: formatMoneyUnits(channelRevenue),
    platform_revenue_usd: formatMoneyUnits(platformRevenue)
  };
}

