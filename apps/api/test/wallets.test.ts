import { describe, expect, it, vi } from "vitest";
import { buildApiServer, hashSessionToken } from "../src/index";
import type {
  CreateVirtualSessionResult,
  SessionRepository,
  WalletRepository
} from "../src/index";

const unusedSessionRepository: SessionRepository = {
  async createVirtualSession(): Promise<CreateVirtualSessionResult> {
    throw new Error("not used");
  }
};

describe("wallet routes", () => {
  it("returns the authenticated end-user wallet", async () => {
    const getUserWallet = vi.fn<WalletRepository["getUserWallet"]>(
      async (sessionTokenHash, now) => {
        expect(sessionTokenHash).toBe(hashSessionToken("mf_sess_wallet"));
        expect(now).toEqual(new Date("2026-06-17T00:00:00.000Z"));
        return {
          id: "11111111-1111-1111-1111-111111111111",
          owner_scope: "end_user",
          owner_id: "22222222-2222-2222-2222-222222222222",
          balance_usd: "10.00000000"
        };
      }
    );
    const walletRepository: WalletRepository = {
      getUserWallet,
      async creditTestBalance() {
        throw new Error("not used");
      }
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      walletRepository,
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/user/wallet",
      headers: {
        authorization: "Bearer mf_sess_wallet"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      owner_scope: "end_user",
      owner_id: "22222222-2222-2222-2222-222222222222",
      balance_usd: "10.00000000"
    });
    expect(getUserWallet).toHaveBeenCalledOnce();
  });

  it("credits a wallet test balance with admin auth", async () => {
    const creditTestBalance = vi.fn<WalletRepository["creditTestBalance"]>(
      async (input) => {
        expect(input).toEqual({
          walletId: "11111111-1111-1111-1111-111111111111",
          amountUsd: "5.25000000",
          now: new Date("2026-06-17T00:00:00.000Z")
        });
        return {
          id: input.walletId,
          owner_scope: "end_user",
          owner_id: "22222222-2222-2222-2222-222222222222",
          balance_usd: "5.25000000"
        };
      }
    );
    const walletRepository: WalletRepository = {
      async getUserWallet() {
        throw new Error("not used");
      },
      creditTestBalance
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      walletRepository,
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/wallets/11111111-1111-1111-1111-111111111111/credit-test-balance",
      headers: {
        authorization: "Bearer mf_admin_test"
      },
      payload: {
        amount_usd: "5.25000000"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      owner_scope: "end_user",
      owner_id: "22222222-2222-2222-2222-222222222222",
      balance_usd: "5.25000000"
    });
    expect(creditTestBalance).toHaveBeenCalledOnce();
  });

  it("requires admin auth before crediting a wallet", async () => {
    const walletRepository: WalletRepository = {
      async getUserWallet() {
        throw new Error("not used");
      },
      async creditTestBalance() {
        throw new Error("admin auth should be checked first");
      }
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      walletRepository,
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/wallets/11111111-1111-1111-1111-111111111111/credit-test-balance",
      payload: {
        amount_usd: "5.25000000"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_session"
      }
    });
  });

  it("rejects zero test-credit amounts", async () => {
    const walletRepository: WalletRepository = {
      async getUserWallet() {
        throw new Error("not used");
      },
      async creditTestBalance() {
        throw new Error("invalid amount should be checked first");
      }
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      walletRepository,
      adminToken: "mf_admin_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/wallets/11111111-1111-1111-1111-111111111111/credit-test-balance",
      headers: {
        authorization: "Bearer mf_admin_test"
      },
      payload: {
        amount_usd: "0"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_request"
      }
    });
  });
});
