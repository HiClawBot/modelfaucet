export type RouteMode = "platform" | "byok" | "local";

export type ScenarioInput = {
  routeMode: RouteMode;
  monthlyUsers: number;
  requestsPerUser: number;
  inputTokens: number;
  outputTokens: number;
  providerCostPerThousandUsd: number;
  markupPercent: number;
  developerShareBps: number;
  byokGatewayFeeUsd: number;
  localSoftwareFeeUsd: number;
};

export type ScenarioResult = {
  monthlyRequests: number;
  monthlyTokens: number;
  providerCostUsd: number;
  endUserPriceUsd: number;
  explicitGatewayFeeUsd: number;
  grossMarginUsd: number;
  developerRevenueUsd: number;
  platformRevenueUsd: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function calculateScenario(input: ScenarioInput): ScenarioResult {
  const monthlyRequests =
    clampNonNegative(input.monthlyUsers) * clampNonNegative(input.requestsPerUser);
  const tokensPerRequest =
    clampNonNegative(input.inputTokens) + clampNonNegative(input.outputTokens);
  const monthlyTokens = monthlyRequests * tokensPerRequest;
  const providerCostUsd =
    (monthlyTokens / 1000) * clampNonNegative(input.providerCostPerThousandUsd);
  const developerShare = Math.min(Math.max(input.developerShareBps, 0), 10000) / 10000;

  if (input.routeMode === "byok") {
    const explicitGatewayFeeUsd =
      monthlyRequests * clampNonNegative(input.byokGatewayFeeUsd);
    const developerRevenueUsd = explicitGatewayFeeUsd * developerShare;
    return {
      monthlyRequests,
      monthlyTokens,
      providerCostUsd: 0,
      endUserPriceUsd: roundMoney(explicitGatewayFeeUsd),
      explicitGatewayFeeUsd: roundMoney(explicitGatewayFeeUsd),
      grossMarginUsd: roundMoney(explicitGatewayFeeUsd),
      developerRevenueUsd: roundMoney(developerRevenueUsd),
      platformRevenueUsd: roundMoney(explicitGatewayFeeUsd - developerRevenueUsd)
    };
  }

  if (input.routeMode === "local") {
    const explicitGatewayFeeUsd =
      monthlyRequests * clampNonNegative(input.localSoftwareFeeUsd);
    const developerRevenueUsd = explicitGatewayFeeUsd * developerShare;
    return {
      monthlyRequests,
      monthlyTokens,
      providerCostUsd: 0,
      endUserPriceUsd: roundMoney(explicitGatewayFeeUsd),
      explicitGatewayFeeUsd: roundMoney(explicitGatewayFeeUsd),
      grossMarginUsd: roundMoney(explicitGatewayFeeUsd),
      developerRevenueUsd: roundMoney(developerRevenueUsd),
      platformRevenueUsd: roundMoney(explicitGatewayFeeUsd - developerRevenueUsd)
    };
  }

  const markupMultiplier = 1 + Math.max(input.markupPercent, 0) / 100;
  const endUserPriceUsd = providerCostUsd * markupMultiplier;
  const grossMarginUsd = endUserPriceUsd - providerCostUsd;
  const developerRevenueUsd = grossMarginUsd * developerShare;

  return {
    monthlyRequests,
    monthlyTokens,
    providerCostUsd: roundMoney(providerCostUsd),
    endUserPriceUsd: roundMoney(endUserPriceUsd),
    explicitGatewayFeeUsd: 0,
    grossMarginUsd: roundMoney(grossMarginUsd),
    developerRevenueUsd: roundMoney(developerRevenueUsd),
    platformRevenueUsd: roundMoney(grossMarginUsd - developerRevenueUsd)
  };
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}
