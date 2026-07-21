import { describe, expect, it } from "vitest";
import { buildApiServer } from "../src/index";
import type { CreateVirtualSessionResult, SessionRepository } from "../src/index";

const unusedSessionRepository: SessionRepository = {
  async createVirtualSession(): Promise<CreateVirtualSessionResult> {
    throw new Error("not used");
  }
};

describe("hosted Beta feature flags", () => {
  const disabledRequests = [
    {
      name: "test credits",
      method: "POST" as const,
      url: "/v1/admin/wallets/11111111-1111-4111-8111-111111111111/credit-test-balance",
      payload: { amount_usd: "1.00000000" }
    },
    {
      name: "Stripe checkout",
      method: "POST" as const,
      url: "/v1/user/stripe/checkout-sessions",
      payload: {}
    },
    {
      name: "Stripe webhook",
      method: "POST" as const,
      url: "/v1/stripe/webhook",
      payload: {}
    },
    {
      name: "payouts",
      method: "POST" as const,
      url: "/v1/admin/payouts/run-mock",
      payload: {}
    },
    {
      name: "user provider keys",
      method: "GET" as const,
      url: "/v1/user/provider-keys"
    },
    {
      name: "developer provider keys",
      method: "GET" as const,
      url: "/v1/developer/provider-keys?public_app_id=app_test"
    }
  ];

  it.each(disabledRequests)("returns 404 when $name is disabled", async (request) => {
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      features: {
        stripePayments: false,
        payouts: false,
        providerKeys: false,
        testCredits: false
      },
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: request.method,
      url: request.url,
      ...(request.payload === undefined ? {} : { payload: request.payload })
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "feature_disabled" } });
  });

  it("advertises only the platform route in platform-only mode", async () => {
    const server = buildApiServer({
      sessionRepository: {
        async createVirtualSession() {
          return {
            sessionId: "session_test",
            endUserId: "user_test",
            walletBalanceUsd: "1.00000000",
            availableModes: ["platform", "developer_key", "byok", "local"]
          };
        }
      },
      features: { platformOnly: true },
      gatewayBaseUrl: "http://localhost:3202/v1",
      sessionTokenTtlSeconds: 3600,
      tokenFactory: () => "mf_sess_platform_only"
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        public_app_id: "app_beta",
        external_user_id: "pilot-user"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ available_modes: ["platform"] });
  });
});
