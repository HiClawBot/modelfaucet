import {
  AddProviderKeyRequestSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  MoneyStringSchema,
  ModelFaucetError,
  PublicAppIdSchema,
  createErrorResponse,
  parseMoneyToUnits
} from "@modelfaucet/shared";
import { z } from "zod";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { createSessionToken, hashExternalUserId, hashSessionToken } from "./crypto";
import type { DashboardRepository } from "./repositories/dashboardRepository";
import type { PaymentRepository } from "./repositories/paymentRepository";
import type { PayoutRepository } from "./repositories/payoutRepository";
import type { ProviderKeyRepository } from "./repositories/providerKeyRepository";
import type { SessionRepository } from "./repositories/sessionRepository";
import type { WalletRepository } from "./repositories/walletRepository";
import { encryptSecret, maskSecret, validateBasicProviderKey } from "./secretEncryption";
import {
  moneyToStripeCents,
  stripeCentsToMoney,
  verifyStripeWebhookSignature,
  type StripeCheckoutClient
} from "./stripe";

export type BuildApiServerOptions = {
  sessionRepository: SessionRepository;
  dashboardRepository?: DashboardRepository;
  providerKeyRepository?: ProviderKeyRepository;
  walletRepository?: WalletRepository;
  paymentRepository?: PaymentRepository;
  payoutRepository?: PayoutRepository;
  stripeCheckoutClient?: StripeCheckoutClient;
  stripeWebhookSecret?: string;
  payoutThresholdUsd?: string;
  secretEncryptionKey?: string;
  developerAdminToken?: string;
  adminToken?: string;
  gatewayBaseUrl: string;
  sessionTokenTtlSeconds: number;
  tokenFactory?: () => `mf_sess_${string}`;
  now?: () => Date;
  logger?: boolean;
};

function toModelFaucetError(error: unknown): ModelFaucetError {
  if (error instanceof ModelFaucetError) {
    return error;
  }

  return new ModelFaucetError({
    code: "invalid_request",
    message: "The request could not be processed.",
    statusCode: 500
  });
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

function requireProviderKeySupport(options: BuildApiServerOptions): {
  providerKeyRepository: ProviderKeyRepository;
  secretEncryptionKey: string;
} {
  if (
    options.providerKeyRepository === undefined ||
    options.secretEncryptionKey === undefined
  ) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: "Provider key storage is not configured.",
      statusCode: 500
    });
  }

  return {
    providerKeyRepository: options.providerKeyRepository,
    secretEncryptionKey: options.secretEncryptionKey
  };
}

function requireWalletSupport(options: BuildApiServerOptions): WalletRepository {
  if (options.walletRepository === undefined) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: "Wallet repository is not configured.",
      statusCode: 500
    });
  }

  return options.walletRepository;
}

function requirePaymentSupport(options: BuildApiServerOptions): {
  paymentRepository: PaymentRepository;
  walletRepository: WalletRepository;
  stripeCheckoutClient: StripeCheckoutClient;
} {
  if (
    options.paymentRepository === undefined ||
    options.walletRepository === undefined ||
    options.stripeCheckoutClient === undefined
  ) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: "Stripe test-mode payments are not configured.",
      statusCode: 500
    });
  }

  return {
    paymentRepository: options.paymentRepository,
    walletRepository: options.walletRepository,
    stripeCheckoutClient: options.stripeCheckoutClient
  };
}

function requirePayoutSupport(options: BuildApiServerOptions): PayoutRepository {
  if (options.payoutRepository === undefined) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: "Payout repository is not configured.",
      statusCode: 500
    });
  }

  return options.payoutRepository;
}

function requireSessionToken(request: { headers: { authorization?: string } }): string {
  const sessionToken = extractBearerToken(request.headers.authorization);
  if (sessionToken === undefined) {
    throw new ModelFaucetError({
      code: "invalid_session",
      message: "Missing bearer session token.",
      statusCode: 401
    });
  }

  return sessionToken;
}

const AddDeveloperProviderKeyRequestSchema = AddProviderKeyRequestSchema.extend({
  public_app_id: PublicAppIdSchema
});

function requireDeveloperAdminToken(
  request: { headers: { authorization?: string } },
  expectedToken: string | undefined
): void {
  const token = extractBearerToken(request.headers.authorization);
  if (token === undefined || expectedToken === undefined || token !== expectedToken) {
    throw new ModelFaucetError({
      code: "invalid_session",
      message: "Missing or invalid developer admin token.",
      statusCode: 401
    });
  }
}

function requireAdminToken(
  request: { headers: { authorization?: string } },
  expectedToken: string | undefined
): void {
  const token = extractBearerToken(request.headers.authorization);
  if (token === undefined || expectedToken === undefined || token !== expectedToken) {
    throw new ModelFaucetError({
      code: "invalid_session",
      message: "Missing or invalid admin token.",
      statusCode: 401
    });
  }
}

const CreditTestBalanceRequestSchema = z
  .object({
    amount_usd: MoneyStringSchema.refine(
      (value) => parseMoneyToUnits(value) > 0n,
      "Credit amount must be greater than zero."
    )
  })
  .strict();

const StripeCheckoutRequestSchema = z
  .object({
    amount_usd: MoneyStringSchema.refine((value) => {
      try {
        moneyToStripeCents(value);
        return true;
      } catch {
        return false;
      }
    }, "Stripe checkout amount must be positive and in whole cents."),
    success_url: z.string().url(),
    cancel_url: z.string().url()
  })
  .strict();

const StripeWebhookEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    data: z.object({
      object: z.unknown()
    })
  })
  .passthrough();

const StripeCheckoutCompletedObjectSchema = z
  .object({
    id: z.string().min(1),
    payment_status: z.string().optional(),
    amount_total: z.number().int().positive(),
    currency: z.literal("usd"),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

const PayoutRunRequestSchema = z
  .object({
    threshold_usd: MoneyStringSchema.refine(
      (value) => parseMoneyToUnits(value) > 0n,
      "Payout threshold must be greater than zero."
    ).optional()
  })
  .strict();

function getStripeSignatureHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getRawWebhookBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }

  return JSON.stringify(body) ?? "";
}

export function buildApiServer(options: BuildApiServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const tokenFactory = options.tokenFactory ?? createSessionToken;
  const now = options.now ?? (() => new Date());

  app.register(cors, {
    origin: true
  });

  if (
    options.sessionRepository.close !== undefined ||
    options.dashboardRepository?.close !== undefined ||
    options.providerKeyRepository?.close !== undefined ||
    options.walletRepository?.close !== undefined ||
    options.paymentRepository?.close !== undefined ||
    options.payoutRepository?.close !== undefined
  ) {
    app.addHook("onClose", async () => {
      await options.sessionRepository.close?.();
      await options.dashboardRepository?.close?.();
      await options.providerKeyRepository?.close?.();
      await options.walletRepository?.close?.();
      await options.paymentRepository?.close?.();
      await options.payoutRepository?.close?.();
    });
  }

  app.get("/health", async () => ({
    ok: true,
    service: "@modelfaucet/api"
  }));

  app.post("/v1/sessions", async (request, reply) => {
    const parsed = CreateSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const error = new ModelFaucetError({
        code: "invalid_request",
        message: "Invalid session request.",
        statusCode: 400,
        details: parsed.error.flatten()
      });
      return reply.code(error.statusCode).send(createErrorResponse(error));
    }

    try {
      const sessionToken = tokenFactory();
      const expiresAt = new Date(now().getTime() + options.sessionTokenTtlSeconds * 1000);
      const createdSession = await options.sessionRepository.createVirtualSession({
        publicAppId: parsed.data.public_app_id,
        externalUserHash: hashExternalUserId(parsed.data.external_user_id),
        tokenHash: hashSessionToken(sessionToken),
        scopes: ["chat"],
        featureKey: parsed.data.feature_key,
        metadata: parsed.data.metadata ?? {},
        expiresAt
      });

      return CreateSessionResponseSchema.parse({
        session_token: sessionToken,
        expires_in: options.sessionTokenTtlSeconds,
        gateway_base_url: options.gatewayBaseUrl,
        available_modes: createdSession.availableModes,
        wallet_balance_usd: createdSession.walletBalanceUsd
      });
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.get("/v1/apps/:publicAppId/usage", async (request, reply) => {
    if (options.dashboardRepository === undefined) {
      const error = new ModelFaucetError({
        code: "invalid_request",
        message: "Dashboard repository is not configured.",
        statusCode: 500
      });
      return reply.code(error.statusCode).send(createErrorResponse(error));
    }

    const params = request.params as { publicAppId?: string };
    if (params.publicAppId === undefined || params.publicAppId.length === 0) {
      const error = new ModelFaucetError({
        code: "invalid_request",
        message: "Missing public app id.",
        statusCode: 400
      });
      return reply.code(error.statusCode).send(createErrorResponse(error));
    }

    try {
      return await options.dashboardRepository.getAppUsage(params.publicAppId);
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.get("/v1/user/wallet", async (request, reply) => {
    try {
      const walletRepository = requireWalletSupport(options);
      const sessionToken = requireSessionToken(request);
      return await walletRepository.getUserWallet(hashSessionToken(sessionToken), now());
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/admin/wallets/:id/credit-test-balance", async (request, reply) => {
    try {
      const walletRepository = requireWalletSupport(options);
      requireAdminToken(request, options.adminToken ?? options.developerAdminToken);
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing or invalid wallet id.",
          statusCode: 400,
          details: params.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const parsed = CreditTestBalanceRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid credit request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      return await walletRepository.creditTestBalance({
        walletId: params.data.id,
        amountUsd: parsed.data.amount_usd,
        now: now()
      });
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/user/stripe/checkout-sessions", async (request, reply) => {
    try {
      const support = requirePaymentSupport(options);
      const sessionToken = requireSessionToken(request);
      const parsed = StripeCheckoutRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid Stripe checkout request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const wallet = await support.walletRepository.getUserWallet(
        hashSessionToken(sessionToken),
        now()
      );
      const checkoutSession = await support.stripeCheckoutClient.createCheckoutSession({
        walletId: wallet.id,
        amountUsd: parsed.data.amount_usd,
        successUrl: parsed.data.success_url,
        cancelUrl: parsed.data.cancel_url
      });
      const topup = await support.paymentRepository.createPendingStripeCheckoutTopup({
        walletId: wallet.id,
        checkoutSessionId: checkoutSession.id,
        checkoutUrl: checkoutSession.url,
        amountUsd: parsed.data.amount_usd,
        now: now()
      });

      return reply.code(201).send({
        checkout_session_id: checkoutSession.id,
        checkout_url: checkoutSession.url,
        wallet_id: wallet.id,
        amount_usd: topup.amount_usd,
        status: topup.status
      });
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/stripe/webhook", async (request, reply) => {
    try {
      if (options.paymentRepository === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Stripe webhook handling is not configured.",
          statusCode: 500
        });
      }

      try {
        verifyStripeWebhookSignature({
          rawBody: getRawWebhookBody(request.body),
          signatureHeader: getStripeSignatureHeader(request.headers["stripe-signature"]),
          webhookSecret: options.stripeWebhookSecret
        });
      } catch (verificationError) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message:
            verificationError instanceof Error
              ? verificationError.message
              : "Stripe webhook signature verification failed.",
          statusCode: 400
        });
      }

      const parsed = StripeWebhookEventSchema.safeParse(request.body);
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid Stripe webhook event.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      if (parsed.data.type !== "checkout.session.completed") {
        return { received: true, ignored: true };
      }

      const checkout = StripeCheckoutCompletedObjectSchema.safeParse(
        parsed.data.data.object
      );
      if (!checkout.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid Stripe checkout completion event.",
          statusCode: 400,
          details: checkout.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      if (checkout.data.payment_status !== undefined && checkout.data.payment_status !== "paid") {
        return { received: true, ignored: true };
      }

      const amountUsd = stripeCentsToMoney(checkout.data.amount_total);
      const topup = await options.paymentRepository.creditStripeCheckoutSession({
        stripeEventId: parsed.data.id,
        checkoutSessionId: checkout.data.id,
        amountUsd,
        now: now()
      });

      return {
        received: true,
        topup
      };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/admin/payouts/run-mock", async (request, reply) => {
    try {
      const payoutRepository = requirePayoutSupport(options);
      requireAdminToken(request, options.adminToken ?? options.developerAdminToken);
      const parsed = PayoutRunRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid payout run request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const items = await payoutRepository.createPendingPayouts({
        thresholdUsd:
          parsed.data.threshold_usd ?? options.payoutThresholdUsd ?? "1.00000000",
        now: now()
      });
      return { items };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/admin/payouts/:id/mark-paid", async (request, reply) => {
    try {
      const payoutRepository = requirePayoutSupport(options);
      requireAdminToken(request, options.adminToken ?? options.developerAdminToken);
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing or invalid payout id.",
          statusCode: 400,
          details: params.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const payout = await payoutRepository.markPayoutPaid({
        payoutId: params.data.id,
        now: now()
      });
      return payout;
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/user/provider-keys", async (request, reply) => {
    try {
      const support = requireProviderKeySupport(options);
      const sessionToken = requireSessionToken(request);
      const parsed = AddProviderKeyRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid provider key request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      validateBasicProviderKey(parsed.data.provider, parsed.data.api_key);

      const created = await support.providerKeyRepository.createUserProviderKey({
        sessionTokenHash: hashSessionToken(sessionToken),
        provider: parsed.data.provider,
        baseUrl: parsed.data.base_url,
        encryptedSecretRef: encryptSecret(
          parsed.data.api_key,
          support.secretEncryptionKey
        ),
        maskedSecret: maskSecret(parsed.data.api_key),
        modelsAllowed: parsed.data.models_allowed,
        budgetLimitUsd: parsed.data.budget_limit_usd,
        priority: parsed.data.priority,
        fallbackToPlatform: parsed.data.fallback_to_platform,
        now: now()
      });

      return reply.code(201).send(created);
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.get("/v1/user/provider-keys", async (request, reply) => {
    try {
      const support = requireProviderKeySupport(options);
      const sessionToken = requireSessionToken(request);
      const items = await support.providerKeyRepository.listUserProviderKeys(
        hashSessionToken(sessionToken),
        now()
      );

      return { items };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.delete("/v1/user/provider-keys/:credentialId", async (request, reply) => {
    try {
      const support = requireProviderKeySupport(options);
      const sessionToken = requireSessionToken(request);
      const params = request.params as { credentialId?: string };
      if (params.credentialId === undefined || params.credentialId.length === 0) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing provider key id.",
          statusCode: 400
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      await support.providerKeyRepository.disableUserProviderKey(
        hashSessionToken(sessionToken),
        params.credentialId,
        now()
      );

      return { ok: true };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/developer/provider-keys", async (request, reply) => {
    try {
      const support = requireProviderKeySupport(options);
      requireDeveloperAdminToken(request, options.developerAdminToken);
      const parsed = AddDeveloperProviderKeyRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid developer provider key request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      validateBasicProviderKey(parsed.data.provider, parsed.data.api_key);

      const created = await support.providerKeyRepository.createDeveloperProviderKey({
        publicAppId: parsed.data.public_app_id,
        provider: parsed.data.provider,
        baseUrl: parsed.data.base_url,
        encryptedSecretRef: encryptSecret(
          parsed.data.api_key,
          support.secretEncryptionKey
        ),
        maskedSecret: maskSecret(parsed.data.api_key),
        modelsAllowed: parsed.data.models_allowed,
        budgetLimitUsd: parsed.data.budget_limit_usd,
        priority: parsed.data.priority,
        fallbackToPlatform: parsed.data.fallback_to_platform,
        now: now()
      });

      return reply.code(201).send(created);
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.get("/v1/developer/provider-keys", async (request, reply) => {
    try {
      const support = requireProviderKeySupport(options);
      requireDeveloperAdminToken(request, options.developerAdminToken);
      const query = z
        .object({ public_app_id: PublicAppIdSchema })
        .safeParse(request.query);
      if (!query.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing or invalid public_app_id.",
          statusCode: 400,
          details: query.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const items = await support.providerKeyRepository.listDeveloperProviderKeys(
        query.data.public_app_id
      );
      return { items };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.delete("/v1/developer/provider-keys/:credentialId", async (request, reply) => {
    try {
      const support = requireProviderKeySupport(options);
      requireDeveloperAdminToken(request, options.developerAdminToken);
      const params = request.params as { credentialId?: string };
      if (params.credentialId === undefined || params.credentialId.length === 0) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing developer provider key id.",
          statusCode: 400
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      await support.providerKeyRepository.disableDeveloperProviderKey(params.credentialId);
      return { ok: true };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  return app;
}
