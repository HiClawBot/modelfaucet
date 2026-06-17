import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/index";
import type {
  CreateVirtualSessionResult,
  SessionRepository,
  SettlementRepository
} from "../src/index";

const unusedSessionRepository: SessionRepository = {
  async createVirtualSession(): Promise<CreateVirtualSessionResult> {
    throw new Error("not used");
  }
};

function settlementNoops(): SettlementRepository {
  return {
    async getLedgerReconciliation() {
      throw new Error("not used");
    },
    async createWalletAdjustment() {
      throw new Error("not used");
    },
    async exportUsageCsv() {
      throw new Error("not used");
    },
    async exportRevenueCsv() {
      throw new Error("not used");
    },
    async exportPayoutsCsv() {
      throw new Error("not used");
    }
  };
}

describe("settlement routes", () => {
  it("returns a ledger reconciliation report with admin auth", async () => {
    const getLedgerReconciliation = vi.fn<
      SettlementRepository["getLedgerReconciliation"]
    >(async (now) => {
      expect(now).toEqual(new Date("2026-06-18T00:00:00.000Z"));
      return {
        generated_at: now.toISOString(),
        summary: {
          wallet_count: 1,
          balanced_count: 1,
          mismatch_count: 0
        },
        items: [
          {
            wallet_id: "11111111-1111-4111-8111-111111111111",
            owner_scope: "end_user",
            owner_id: "22222222-2222-4222-8222-222222222222",
            wallet_balance_usd: "10.00000000",
            ledger_balance_usd: "10.00000000",
            delta_usd: "0.00000000",
            status: "balanced"
          }
        ]
      };
    });
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      settlementRepository: { ...settlementNoops(), getLedgerReconciliation },
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-18T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/admin/reconciliation/ledger",
      headers: {
        authorization: "Bearer mf_admin_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      summary: {
        mismatch_count: 0
      },
      items: [
        {
          status: "balanced"
        }
      ]
    });
    expect(getLedgerReconciliation).toHaveBeenCalledOnce();
  });

  it("records an explicit wallet refund adjustment", async () => {
    const createWalletAdjustment = vi.fn<
      SettlementRepository["createWalletAdjustment"]
    >(async (input) => {
      expect(input).toEqual({
        walletId: "11111111-1111-4111-8111-111111111111",
        kind: "refund",
        direction: "credit",
        amountUsd: "2.50000000",
        reason: "test refund",
        idempotencyKey: "refund-test-001",
        now: new Date("2026-06-18T00:00:00.000Z")
      });
      return {
        id: "33333333-3333-4333-8333-333333333333",
        wallet_id: input.walletId,
        kind: input.kind,
        direction: input.direction,
        amount_usd: input.amountUsd,
        status: "applied",
        reason: input.reason,
        idempotency_key: input.idempotencyKey,
        wallet_balance_usd: "12.50000000"
      };
    });
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      settlementRepository: { ...settlementNoops(), createWalletAdjustment },
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-18T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/wallets/11111111-1111-4111-8111-111111111111/adjustments",
      headers: {
        authorization: "Bearer mf_admin_test"
      },
      payload: {
        kind: "refund",
        direction: "credit",
        amount_usd: "2.50000000",
        reason: "test refund",
        idempotency_key: "refund-test-001"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: "33333333-3333-4333-8333-333333333333",
      wallet_id: "11111111-1111-4111-8111-111111111111",
      kind: "refund",
      direction: "credit",
      amount_usd: "2.50000000",
      status: "applied",
      reason: "test refund",
      idempotency_key: "refund-test-001",
      wallet_balance_usd: "12.50000000"
    });
    expect(createWalletAdjustment).toHaveBeenCalledOnce();
  });

  it("exports admin CSV reports without JSON wrapping", async () => {
    const exportUsageCsv = vi.fn<SettlementRepository["exportUsageCsv"]>(
      async () =>
        "created_at,request_id,public_app_id\n2026-06-18T00:00:00.000Z,req_123,app_pub_demo\n"
    );
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      settlementRepository: { ...settlementNoops(), exportUsageCsv },
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/admin/reports/usage.csv",
      headers: {
        authorization: "Bearer mf_admin_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.body).toContain("created_at,request_id,public_app_id");
    expect(response.body).not.toContain("\"error\"");
    expect(exportUsageCsv).toHaveBeenCalledOnce();
  });

  it("requires admin auth before reconciliation", async () => {
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      settlementRepository: settlementNoops(),
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/admin/reconciliation/ledger"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_session"
      }
    });
  });
});
