import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApiServer, hashSessionToken, moneyToStripeCents } from "../src/index";
import type {
  CreateVirtualSessionResult,
  PaymentRepository,
  SessionRepository,
  StripeCheckoutClient,
  WalletRepository
} from "../src/index";

const unusedSessionRepository: SessionRepository = {
  async createVirtualSession(): Promise<CreateVirtualSessionResult> {
    throw new Error("not used");
  }
};

function walletRepository(): WalletRepository {
  return {
    async getUserWallet(sessionTokenHash) {
      expect(sessionTokenHash).toBe(hashSessionToken("mf_sess_stripe"));
      return {
        id: "11111111-1111-4111-8111-111111111111",
        owner_scope: "end_user",
        owner_id: "22222222-2222-4222-8222-222222222222",
        balance_usd: "0.00000000"
      };
    },
    async creditTestBalance() {
      throw new Error("not used");
    }
  };
}

function paymentNoops(): PaymentRepository {
  return {
    async createPendingStripeCheckoutTopup() {
      throw new Error("not used");
    },
    async creditStripeCheckoutSession() {
      throw new Error("not used");
    }
  };
}

function stripeSignature(rawBody: string, secret: string, timestamp = "1780000000"): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("stripe payment routes", () => {
  it("converts Stripe checkout amounts to whole cents", () => {
    expect(moneyToStripeCents("5.25000000")).toBe(525);
    expect(() => moneyToStripeCents("5.00000001")).toThrow("whole cents");
  });

  it("creates a Stripe checkout session without exposing the server secret", async () => {
    const createCheckoutSession = vi.fn<StripeCheckoutClient["createCheckoutSession"]>(
      async (input) => {
        expect(input).toEqual({
          walletId: "11111111-1111-4111-8111-111111111111",
          amountUsd: "5.25000000",
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel"
        });
        return {
          id: "cs_test_123",
          url: "https://checkout.stripe.com/c/pay/cs_test_123"
        };
      }
    );
    const createPendingStripeCheckoutTopup = vi.fn<
      PaymentRepository["createPendingStripeCheckoutTopup"]
    >(async (input) => {
      expect(input).toMatchObject({
        walletId: "11111111-1111-4111-8111-111111111111",
        checkoutSessionId: "cs_test_123",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
        amountUsd: "5.25000000"
      });
      return {
        id: "33333333-3333-4333-8333-333333333333",
        wallet_id: input.walletId,
        provider: "stripe",
        provider_checkout_session_id: input.checkoutSessionId,
        amount_usd: input.amountUsd,
        status: "pending",
        checkout_url: input.checkoutUrl
      };
    });
    const paymentRepository: PaymentRepository = {
      ...paymentNoops(),
      createPendingStripeCheckoutTopup
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      walletRepository: walletRepository(),
      paymentRepository,
      stripeCheckoutClient: { createCheckoutSession },
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/user/stripe/checkout-sessions",
      headers: {
        authorization: "Bearer mf_sess_stripe"
      },
      payload: {
        amount_usd: "5.25000000",
        success_url: "https://example.com/success",
        cancel_url: "https://example.com/cancel"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain("sk_");
    expect(response.json()).toEqual({
      checkout_session_id: "cs_test_123",
      checkout_url: "https://checkout.stripe.com/c/pay/cs_test_123",
      wallet_id: "11111111-1111-4111-8111-111111111111",
      amount_usd: "5.25000000",
      status: "pending"
    });
    expect(createCheckoutSession).toHaveBeenCalledOnce();
    expect(createPendingStripeCheckoutTopup).toHaveBeenCalledOnce();
  });

  it("credits a wallet from a signed checkout completion webhook", async () => {
    const creditStripeCheckoutSession = vi.fn<
      PaymentRepository["creditStripeCheckoutSession"]
    >(async (input) => {
      expect(input).toMatchObject({
        stripeEventId: "evt_test_123",
        checkoutSessionId: "cs_test_123",
        amountUsd: "5.25000000"
      });
      return {
        id: "33333333-3333-4333-8333-333333333333",
        wallet_id: "11111111-1111-4111-8111-111111111111",
        provider: "stripe",
        provider_checkout_session_id: input.checkoutSessionId,
        provider_event_id: input.stripeEventId,
        amount_usd: input.amountUsd,
        status: "credited",
        credited_wallet_balance_usd: "5.25000000"
      };
    });
    const paymentRepository: PaymentRepository = {
      ...paymentNoops(),
      creditStripeCheckoutSession
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      paymentRepository,
      stripeWebhookSecret: "whsec_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });
    const webhookEvent = {
      id: "evt_test_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          payment_status: "paid",
          amount_total: 525,
          currency: "usd"
        }
      }
    };
    const rawBody = JSON.stringify(webhookEvent);

    const response = await server.inject({
      method: "POST",
      url: "/v1/stripe/webhook",
      headers: {
        "stripe-signature": stripeSignature(rawBody, "whsec_test")
      },
      payload: webhookEvent
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      received: true,
      topup: {
        provider_checkout_session_id: "cs_test_123",
        provider_event_id: "evt_test_123",
        status: "credited",
        credited_wallet_balance_usd: "5.25000000"
      }
    });
    expect(creditStripeCheckoutSession).toHaveBeenCalledOnce();
  });

  it("rejects unsigned Stripe webhook payloads when a webhook secret is configured", async () => {
    const paymentRepository: PaymentRepository = paymentNoops();
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      paymentRepository,
      stripeWebhookSecret: "whsec_test",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/stripe/webhook",
      payload: {
        id: "evt_test_123",
        type: "checkout.session.completed",
        data: { object: {} }
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
