import { describe, expect, it } from "vitest";
import { buildLedgerEntryDrafts, type RatedUsageLedgerInput } from "../src/index";

const ratedUsage: RatedUsageLedgerInput = {
  request_id: "req_ledger",
  app_id: "app_123",
  developer_id: "dev_123",
  end_user_id: "usr_123",
  feature_key: "customer_reply",
  route_mode: "platform",
  provider: "mock",
  model: "auto-text",
  input_tokens: 100,
  output_tokens: 50,
  cached_tokens: 0,
  upstream_cost_usd: "1.00000000",
  retail_price_usd: "1.30000000",
  gross_margin_usd: "0.30000000",
  channel_revenue_usd: "0.12000000",
  platform_revenue_usd: "0.18000000"
};

describe("ledger service helpers", () => {
  it("builds one end-user debit and provider/developer/platform credits", () => {
    expect(buildLedgerEntryDrafts(ratedUsage)).toEqual([
      {
        ownerScope: "end_user",
        ownerId: "usr_123",
        direction: "debit",
        amountUsd: "1.30000000",
        reason: "usage_retail_price"
      },
      {
        ownerScope: "provider_cost",
        ownerId: "00000000-0000-0000-0000-000000000002",
        direction: "credit",
        amountUsd: "1.00000000",
        reason: "usage_provider_cost"
      },
      {
        ownerScope: "developer",
        ownerId: "dev_123",
        direction: "credit",
        amountUsd: "0.12000000",
        reason: "usage_channel_revenue"
      },
      {
        ownerScope: "platform",
        ownerId: "00000000-0000-0000-0000-000000000001",
        direction: "credit",
        amountUsd: "0.18000000",
        reason: "usage_platform_revenue"
      }
    ]);
  });

  it("rejects malformed money values before writing ledger rows", () => {
    expect(() =>
      buildLedgerEntryDrafts({
        ...ratedUsage,
        retail_price_usd: "-1.00000000"
      })
    ).toThrow("Invalid money string");
  });
});
