import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/index";
import type {
  CreateVirtualSessionResult,
  PayoutRepository,
  SessionRepository
} from "../src/index";

const unusedSessionRepository: SessionRepository = {
  async createVirtualSession(): Promise<CreateVirtualSessionResult> {
    throw new Error("not used");
  }
};

function payoutNoops(): PayoutRepository {
  return {
    async createPendingPayouts() {
      throw new Error("not used");
    },
    async approvePayout() {
      throw new Error("not used");
    },
    async markPayoutPaid() {
      throw new Error("not used");
    }
  };
}

describe("payout routes", () => {
  it("creates pending mock payouts with admin auth", async () => {
    const createPendingPayouts = vi.fn<PayoutRepository["createPendingPayouts"]>(
      async (input) => {
        expect(input).toEqual({
          thresholdUsd: "0.50000000",
          now: new Date("2026-06-17T00:00:00.000Z")
        });
        return [
          {
            id: "11111111-1111-4111-8111-111111111111",
            developer_id: "22222222-2222-4222-8222-222222222222",
            amount_usd: "0.75000000",
            status: "pending",
            provider: "mock"
          }
        ];
      }
    );
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      payoutRepository: { ...payoutNoops(), createPendingPayouts },
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/payouts/run-mock",
      headers: {
        authorization: "Bearer mf_admin_test"
      },
      payload: {
        threshold_usd: "0.50000000"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          developer_id: "22222222-2222-4222-8222-222222222222",
          amount_usd: "0.75000000",
          status: "pending",
          provider: "mock"
        }
      ]
    });
    expect(createPendingPayouts).toHaveBeenCalledOnce();
  });

  it("approves a pending payout before payment", async () => {
    const approvePayout = vi.fn<PayoutRepository["approvePayout"]>(async (input) => {
      expect(input).toEqual({
        payoutId: "11111111-1111-4111-8111-111111111111",
        operatorNote: "reviewed in test mode",
        now: new Date("2026-06-17T00:00:00.000Z")
      });
      return {
        id: input.payoutId,
        developer_id: "22222222-2222-4222-8222-222222222222",
        amount_usd: "0.75000000",
        status: "processing",
        provider: "mock"
      };
    });
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      payoutRepository: { ...payoutNoops(), approvePayout },
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/payouts/11111111-1111-4111-8111-111111111111/approve",
      headers: {
        authorization: "Bearer mf_admin_test"
      },
      payload: {
        operator_note: "reviewed in test mode"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      developer_id: "22222222-2222-4222-8222-222222222222",
      amount_usd: "0.75000000",
      status: "processing",
      provider: "mock"
    });
    expect(approvePayout).toHaveBeenCalledOnce();
  });

  it("marks an approved mock payout paid in dev mode", async () => {
    const markPayoutPaid = vi.fn<PayoutRepository["markPayoutPaid"]>(async (input) => {
      expect(input).toEqual({
        payoutId: "11111111-1111-4111-8111-111111111111",
        now: new Date("2026-06-17T00:00:00.000Z")
      });
      return {
        id: input.payoutId,
        developer_id: "22222222-2222-4222-8222-222222222222",
        amount_usd: "0.75000000",
        status: "paid",
        provider: "mock",
        provider_payout_id: "po_mock_111111111111111111"
      };
    });
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      payoutRepository: { ...payoutNoops(), markPayoutPaid },
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/payouts/11111111-1111-4111-8111-111111111111/mark-paid",
      headers: {
        authorization: "Bearer mf_admin_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      developer_id: "22222222-2222-4222-8222-222222222222",
      amount_usd: "0.75000000",
      status: "paid",
      provider: "mock",
      provider_payout_id: "po_mock_111111111111111111"
    });
    expect(markPayoutPaid).toHaveBeenCalledOnce();
  });

  it("requires admin auth before running payouts", async () => {
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      payoutRepository: payoutNoops(),
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/payouts/run-mock",
      payload: {
        threshold_usd: "0.50000000"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_session"
      }
    });
  });
});
