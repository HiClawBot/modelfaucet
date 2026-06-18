import { describe, expect, it } from "vitest";
import { calculateScenario } from "../src/model";

const baseInput = {
  monthlyUsers: 3200,
  requestsPerUser: 18,
  inputTokens: 850,
  outputTokens: 260,
  providerCostPerThousandUsd: 0.003,
  markupPercent: 35,
  developerShareBps: 4200,
  byokGatewayFeeUsd: 0.004,
  localSoftwareFeeUsd: 0.002
};

describe("scenario model", () => {
  it("calculates platform route revenue share from explicit markup", () => {
    const result = calculateScenario({
      ...baseInput,
      routeMode: "platform"
    });

    expect(result.monthlyRequests).toBe(57600);
    expect(result.providerCostUsd).toBe(191.81);
    expect(result.endUserPriceUsd).toBe(258.94);
    expect(result.developerRevenueUsd).toBe(28.2);
    expect(result.platformRevenueUsd).toBe(38.94);
  });

  it("keeps BYOK provider cost out of platform revenue math", () => {
    const result = calculateScenario({
      ...baseInput,
      routeMode: "byok"
    });

    expect(result.providerCostUsd).toBe(0);
    expect(result.explicitGatewayFeeUsd).toBe(230.4);
    expect(result.developerRevenueUsd).toBe(96.77);
    expect(result.platformRevenueUsd).toBe(133.63);
  });

  it("treats local mode as an explicit software fee with no cloud cost", () => {
    const result = calculateScenario({
      ...baseInput,
      routeMode: "local"
    });

    expect(result.providerCostUsd).toBe(0);
    expect(result.explicitGatewayFeeUsd).toBe(115.2);
    expect(result.grossMarginUsd).toBe(115.2);
  });
});
