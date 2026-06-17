import {
  ROUTE_MODES,
  formatMoneyUnits,
  parseMoneyToUnits,
  pricePlatformUsage,
  priceZeroUpstreamUsage,
  type ModelPrice,
  type RatedUsage,
  type RevenueRule,
  type RouteMode,
  type UsageEvent
} from "@modelfaucet/shared";

const TOKENS_PER_MILLION = 1_000_000n;
const validRouteModes = new Set<string>(ROUTE_MODES);

function assertKnownRouteMode(routeMode: string): asserts routeMode is RouteMode {
  if (!validRouteModes.has(routeMode)) {
    throw new Error(`Unknown route mode: ${routeMode}`);
  }
}

function assertNonNegativeTokens(event: UsageEvent): void {
  for (const value of [event.input_tokens, event.output_tokens, event.cached_tokens]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("Token counts must be non-negative integers");
    }
  }
}

function tokenCostUsd(tokens: number, pricePerMillionTokensUsd: string): string {
  const priceUnits = parseMoneyToUnits(pricePerMillionTokensUsd);
  return formatMoneyUnits((priceUnits * BigInt(tokens)) / TOKENS_PER_MILLION);
}

function addMoney(...amounts: string[]): string {
  return formatMoneyUnits(amounts.reduce((sum, amount) => sum + parseMoneyToUnits(amount), 0n));
}

function calculateUpstreamCost(event: UsageEvent, price: ModelPrice): string {
  return addMoney(
    tokenCostUsd(event.input_tokens, price.input_price_per_1m_tokens_usd),
    tokenCostUsd(event.output_tokens, price.output_price_per_1m_tokens_usd),
    tokenCostUsd(event.cached_tokens, price.cached_price_per_1m_tokens_usd ?? "0")
  );
}

export function rateUsage(
  event: UsageEvent,
  price: ModelPrice,
  rule: RevenueRule
): RatedUsage {
  assertKnownRouteMode(event.route_mode);
  assertNonNegativeTokens(event);

  if (event.route_mode === "platform" || event.route_mode === "developer_key") {
    return pricePlatformUsage({
      requestId: event.request_id,
      routeMode: event.route_mode,
      inputTokens: event.input_tokens,
      outputTokens: event.output_tokens,
      cachedTokens: event.cached_tokens,
      upstreamCostUsd: calculateUpstreamCost(event, price),
      markupPercent: rule.markup_percent ?? 30,
      channelShareBps: rule.channel_share_bps
    });
  }

  return priceZeroUpstreamUsage({
    requestId: event.request_id,
    routeMode: event.route_mode,
    inputTokens: event.input_tokens,
    outputTokens: event.output_tokens,
    cachedTokens: event.cached_tokens,
    explicitGatewayFeeUsd: rule.explicit_gateway_fee_usd ?? "0",
    channelShareBps: rule.channel_share_bps
  });
}

