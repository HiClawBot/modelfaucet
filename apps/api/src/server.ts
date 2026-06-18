import {
  AddProviderKeyRequestSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  MoneyStringSchema,
  ModelFaucetError,
  PublicAppIdSchema,
  createErrorResponse,
  createRequestId,
  InMemoryMetrics,
  InMemoryRateLimiter,
  parseMoneyToUnits
} from "@modelfaucet/shared";
import { z } from "zod";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import {
  createDeveloperApiToken,
  createSessionToken,
  hashDeveloperApiToken,
  hashExternalUserId,
  hashSessionToken
} from "./crypto";
import type { DashboardRepository } from "./repositories/dashboardRepository";
import type {
  DeveloperAuthContext,
  DeveloperAuthRepository,
  DeveloperScope
} from "./repositories/developerAuthRepository";
import { developerScopes } from "./repositories/developerAuthRepository";
import type { DeveloperConsoleRepository } from "./repositories/developerConsoleRepository";
import type { PaymentRepository } from "./repositories/paymentRepository";
import type { PayoutRepository } from "./repositories/payoutRepository";
import type { ProviderKeyRepository } from "./repositories/providerKeyRepository";
import type { SettlementRepository } from "./repositories/settlementRepository";
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
  developerAuthRepository?: DeveloperAuthRepository;
  developerConsoleRepository?: DeveloperConsoleRepository;
  providerKeyRepository?: ProviderKeyRepository;
  walletRepository?: WalletRepository;
  paymentRepository?: PaymentRepository;
  payoutRepository?: PayoutRepository;
  settlementRepository?: SettlementRepository;
  stripeCheckoutClient?: StripeCheckoutClient;
  stripeWebhookSecret?: string;
  payoutThresholdUsd?: string;
  secretEncryptionKey?: string;
  developerAdminToken?: string;
  adminToken?: string;
  corsOrigins?: true | string[];
  metrics?: InMemoryMetrics;
  rateLimiter?: InMemoryRateLimiter;
  requestIdFactory?: () => string;
  gatewayBaseUrl: string;
  sessionTokenTtlSeconds: number;
  tokenFactory?: () => `mf_sess_${string}`;
  developerTokenFactory?: () => `mf_dev_${string}`;
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

function requireSettlementSupport(options: BuildApiServerOptions): SettlementRepository {
  if (options.settlementRepository === undefined) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: "Settlement repository is not configured.",
      statusCode: 500
    });
  }

  return options.settlementRepository;
}

function requireDeveloperConsoleSupport(
  options: BuildApiServerOptions
): DeveloperConsoleRepository {
  if (options.developerConsoleRepository === undefined) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: "Developer console repository is not configured.",
      statusCode: 500
    });
  }

  return options.developerConsoleRepository;
}

function requireDeveloperAuthSupport(
  options: BuildApiServerOptions
): DeveloperAuthRepository {
  if (options.developerAuthRepository === undefined) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: "Developer API token storage is not configured.",
      statusCode: 500
    });
  }

  return options.developerAuthRepository;
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

const DeveloperScopeSchema = z.enum(developerScopes);

const CreateDeveloperTokenRequestSchema = z
  .object({
    developer_id: z.string().uuid().optional(),
    developer_email: z.string().email().optional(),
    name: z.string().min(1).max(128),
    scopes: z
      .array(DeveloperScopeSchema)
      .min(1)
      .max(developerScopes.length)
      .optional()
      .default([...developerScopes]),
    expires_at: z.string().datetime({ offset: true }).optional()
  })
  .strict();

const DeveloperTokenParamsSchema = z.object({
  tokenId: z.string().uuid()
});

const DeveloperAppStatusSchema = z.enum(["active", "disabled"]);

const CreateDeveloperAppRequestSchema = z
  .object({
    public_app_id: PublicAppIdSchema,
    name: z.string().min(1).max(256),
    vertical: z.string().min(1).max(128).optional(),
    default_revenue_share_bps: z.number().int().min(0).max(10000).optional().default(4000),
    status: DeveloperAppStatusSchema.optional().default("active")
  })
  .strict();

const UpdateDeveloperAppRequestSchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    vertical: z.string().min(1).max(128).optional(),
    default_revenue_share_bps: z.number().int().min(0).max(10000).optional(),
    status: DeveloperAppStatusSchema.optional()
  })
  .strict();

const DeveloperJsonObjectSchema = z.record(z.string(), z.unknown());

const CreateDeveloperFeatureRequestSchema = z
  .object({
    feature_key: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_:-]+$/),
    display_name: z.string().min(1).max(256),
    policy: DeveloperJsonObjectSchema.optional().default({}),
    pricing: DeveloperJsonObjectSchema.optional().default({})
  })
  .strict();

const UpdateDeveloperFeatureRequestSchema = z
  .object({
    display_name: z.string().min(1).max(256).optional(),
    policy: DeveloperJsonObjectSchema.optional(),
    pricing: DeveloperJsonObjectSchema.optional()
  })
  .strict();

const DeveloperAppParamsSchema = z.object({
  publicAppId: PublicAppIdSchema
});

const DeveloperFeatureParamsSchema = z.object({
  publicAppId: PublicAppIdSchema,
  featureKey: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_:-]+$/)
});

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

async function requireDeveloperAuth(
  request: { headers: { authorization?: string } },
  options: BuildApiServerOptions,
  requiredScopes: DeveloperScope[],
  currentTime: Date
): Promise<DeveloperAuthContext> {
  const token = extractBearerToken(request.headers.authorization);
  if (
    token !== undefined &&
    options.developerAdminToken !== undefined &&
    token === options.developerAdminToken
  ) {
    return {
      authMethod: "developer_admin",
      scopes: [...developerScopes]
    };
  }

  if (token === undefined || options.developerAuthRepository === undefined) {
    throw new ModelFaucetError({
      code: "invalid_session",
      message: "Missing or invalid developer token.",
      statusCode: 401
    });
  }

  const auth = await options.developerAuthRepository.authenticateToken(
    hashDeveloperApiToken(token),
    currentTime
  );
  if (auth === undefined) {
    throw new ModelFaucetError({
      code: "invalid_session",
      message: "Missing or invalid developer token.",
      statusCode: 401
    });
  }

  const missingScope = requiredScopes.find((scope) => !auth.scopes.includes(scope));
  if (missingScope !== undefined) {
    throw new ModelFaucetError({
      code: "forbidden",
      message: `Developer token is missing required scope: ${missingScope}.`,
      statusCode: 403
    });
  }

  return auth;
}

function developerIdFilter(auth: DeveloperAuthContext): string | undefined {
  if (auth.authMethod === "developer_admin") {
    return undefined;
  }

  if (auth.developerId === undefined) {
    throw new ModelFaucetError({
      code: "invalid_session",
      message: "Developer token is not bound to a developer.",
      statusCode: 401
    });
  }

  return auth.developerId;
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

const PayoutApproveRequestSchema = z
  .object({
    operator_note: z.string().min(1).max(1000).optional()
  })
  .strict();

const WalletAdjustmentRequestSchema = z
  .object({
    kind: z.enum(["adjustment", "refund", "chargeback"]).default("adjustment"),
    direction: z.enum(["credit", "debit"]),
    amount_usd: MoneyStringSchema.refine(
      (value) => parseMoneyToUnits(value) > 0n,
      "Wallet adjustment amount must be greater than zero."
    ),
    reason: z.string().min(1).max(1000).optional(),
    idempotency_key: z.string().min(8).max(128).optional()
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

function routeLabel(path: string): string {
  return path.split("?")[0] ?? path;
}

function shouldSkipRateLimit(route: string): boolean {
  return route === "/health" || route === "/ready" || route === "/metrics";
}

function injectRequestId(payload: unknown, requestId: string): unknown {
  if (typeof payload !== "string" || !payload.includes("\"error\"")) {
    return payload;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof parsed.error === "object" &&
      parsed.error !== null &&
      !("request_id" in parsed.error)
    ) {
      return JSON.stringify({
        ...parsed,
        error: {
          ...parsed.error,
          request_id: requestId
        }
      });
    }
  } catch {
    return payload;
  }

  return payload;
}

export function buildApiServer(options: BuildApiServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const tokenFactory = options.tokenFactory ?? createSessionToken;
  const developerTokenFactory = options.developerTokenFactory ?? createDeveloperApiToken;
  const now = options.now ?? (() => new Date());
  const metrics = options.metrics ?? new InMemoryMetrics();
  const requestIdFactory =
    options.requestIdFactory ?? (() => createRequestId(Date.now(), Math.random));
  const requestIds = new WeakMap<object, string>();
  const requestStartedAt = new WeakMap<object, number>();

  app.register(cors, {
    origin: options.corsOrigins ?? true
  });

  app.addHook("onRequest", async (request, reply) => {
    const incomingRequestId = request.headers["x-request-id"];
    const requestId =
      typeof incomingRequestId === "string" && incomingRequestId.trim().length > 0
        ? incomingRequestId.trim()
        : requestIdFactory();
    const route = routeLabel(request.url);
    requestIds.set(request.raw, requestId);
    requestStartedAt.set(request.raw, Date.now());
    reply.header("x-request-id", requestId);

    if (options.rateLimiter !== undefined && !shouldSkipRateLimit(route)) {
      const rateLimit = options.rateLimiter.check(`${request.ip}:${route}`, Date.now());
      reply.header("x-ratelimit-remaining", String(rateLimit.remaining));
      reply.header("x-ratelimit-reset", String(Math.ceil(rateLimit.resetAtMs / 1000)));
      if (!rateLimit.allowed) {
        metrics.incrementRateLimited("@modelfaucet/api", route);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((rateLimit.resetAtMs - Date.now()) / 1000)
        );
        const error = new ModelFaucetError({
          code: "rate_limited",
          message: "Rate limit exceeded.",
          requestId,
          statusCode: 429
        });
        return reply
          .header("retry-after", String(retryAfterSeconds))
          .code(error.statusCode)
          .send(createErrorResponse(error));
      }
    }
  });

  app.addHook("onSend", async (request, _reply, payload) => {
    const requestId = requestIds.get(request.raw);
    return requestId === undefined ? payload : injectRequestId(payload, requestId);
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAt = requestStartedAt.get(request.raw) ?? Date.now();
    metrics.observeRequest({
      service: "@modelfaucet/api",
      method: request.method,
      route: routeLabel(request.url),
      statusCode: reply.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  if (
    options.sessionRepository.close !== undefined ||
    options.dashboardRepository?.close !== undefined ||
    options.developerConsoleRepository?.close !== undefined ||
    options.providerKeyRepository?.close !== undefined ||
    options.walletRepository?.close !== undefined ||
    options.paymentRepository?.close !== undefined ||
    options.payoutRepository?.close !== undefined ||
    options.settlementRepository?.close !== undefined
  ) {
    app.addHook("onClose", async () => {
      await options.sessionRepository.close?.();
      await options.dashboardRepository?.close?.();
      await options.developerConsoleRepository?.close?.();
      await options.providerKeyRepository?.close?.();
      await options.walletRepository?.close?.();
      await options.paymentRepository?.close?.();
      await options.payoutRepository?.close?.();
      await options.settlementRepository?.close?.();
    });
  }

  app.get("/health", async () => ({
    ok: true,
    service: "@modelfaucet/api"
  }));

  app.get("/ready", async () => ({
    ok: true,
    service: "@modelfaucet/api",
    checks: {
      database: "configured",
      gateway_base_url: options.gatewayBaseUrl
    }
  }));

  app.get("/metrics", async (_request, reply) =>
    reply.type("text/plain; version=0.0.4").send(metrics.renderPrometheus())
  );

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

  app.post("/v1/admin/payouts/:id/approve", async (request, reply) => {
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

      const parsed = PayoutApproveRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid payout approval request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const payout = await payoutRepository.approvePayout({
        payoutId: params.data.id,
        operatorNote: parsed.data.operator_note,
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

  app.get("/v1/admin/reconciliation/ledger", async (request, reply) => {
    try {
      const settlementRepository = requireSettlementSupport(options);
      requireAdminToken(request, options.adminToken ?? options.developerAdminToken);
      return await settlementRepository.getLedgerReconciliation(now());
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/admin/wallets/:id/adjustments", async (request, reply) => {
    try {
      const settlementRepository = requireSettlementSupport(options);
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

      const parsed = WalletAdjustmentRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid wallet adjustment request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const adjustment = await settlementRepository.createWalletAdjustment({
        walletId: params.data.id,
        kind: parsed.data.kind,
        direction: parsed.data.direction,
        amountUsd: parsed.data.amount_usd,
        reason: parsed.data.reason,
        idempotencyKey: parsed.data.idempotency_key,
        now: now()
      });
      return reply.code(201).send(adjustment);
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.get("/v1/admin/reports/usage.csv", async (request, reply) => {
    try {
      const settlementRepository = requireSettlementSupport(options);
      requireAdminToken(request, options.adminToken ?? options.developerAdminToken);
      return reply.type("text/csv; charset=utf-8").send(await settlementRepository.exportUsageCsv());
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.get("/v1/admin/reports/revenue.csv", async (request, reply) => {
    try {
      const settlementRepository = requireSettlementSupport(options);
      requireAdminToken(request, options.adminToken ?? options.developerAdminToken);
      return reply
        .type("text/csv; charset=utf-8")
        .send(await settlementRepository.exportRevenueCsv());
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.get("/v1/admin/reports/payouts.csv", async (request, reply) => {
    try {
      const settlementRepository = requireSettlementSupport(options);
      requireAdminToken(request, options.adminToken ?? options.developerAdminToken);
      return reply
        .type("text/csv; charset=utf-8")
        .send(await settlementRepository.exportPayoutsCsv());
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/developer/tokens", async (request, reply) => {
    try {
      const repository = requireDeveloperAuthSupport(options);
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:tokens:write"],
        now()
      );
      const parsed = CreateDeveloperTokenRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid developer token request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const scopedDeveloperId = developerIdFilter(auth);
      if (
        scopedDeveloperId !== undefined &&
        ((parsed.data.developer_id !== undefined &&
          parsed.data.developer_id !== scopedDeveloperId) ||
          (parsed.data.developer_email !== undefined &&
            parsed.data.developer_email !== auth.developerEmail))
      ) {
        const error = new ModelFaucetError({
          code: "forbidden",
          message: "Developer token cannot manage another developer.",
          statusCode: 403
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const token = developerTokenFactory();
      const item = await repository.createToken({
        developerId: scopedDeveloperId ?? parsed.data.developer_id,
        developerEmail:
          scopedDeveloperId === undefined ? parsed.data.developer_email : undefined,
        name: parsed.data.name,
        tokenHash: hashDeveloperApiToken(token),
        tokenPrefix: token.slice(0, "mf_dev_".length + 8),
        scopes: [...new Set(parsed.data.scopes)],
        expiresAt:
          parsed.data.expires_at === undefined
            ? undefined
            : new Date(parsed.data.expires_at),
        now: now()
      });

      return reply.code(201).send({ token, item });
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.get("/v1/developer/tokens", async (request, reply) => {
    try {
      const repository = requireDeveloperAuthSupport(options);
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:tokens:read"],
        now()
      );
      const items = await repository.listTokens(developerIdFilter(auth));
      return { items };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.delete("/v1/developer/tokens/:tokenId", async (request, reply) => {
    try {
      const repository = requireDeveloperAuthSupport(options);
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:tokens:write"],
        now()
      );
      const params = DeveloperTokenParamsSchema.safeParse(request.params);
      if (!params.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing or invalid developer token id.",
          statusCode: 400,
          details: params.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      await repository.revokeToken(params.data.tokenId, now(), developerIdFilter(auth));
      return { ok: true };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.get("/v1/developer/apps", async (request, reply) => {
    try {
      const repository = requireDeveloperConsoleSupport(options);
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:apps:read"],
        now()
      );
      const items = await repository.listApps(developerIdFilter(auth));
      return { items };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/developer/apps", async (request, reply) => {
    try {
      const repository = requireDeveloperConsoleSupport(options);
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:apps:write"],
        now()
      );
      const parsed = CreateDeveloperAppRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid developer app request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const app = await repository.createApp({
        developerId: developerIdFilter(auth),
        publicAppId: parsed.data.public_app_id,
        name: parsed.data.name,
        vertical: parsed.data.vertical,
        defaultRevenueShareBps: parsed.data.default_revenue_share_bps,
        status: parsed.data.status,
        now: now()
      });
      return reply.code(201).send(app);
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.patch("/v1/developer/apps/:publicAppId", async (request, reply) => {
    try {
      const repository = requireDeveloperConsoleSupport(options);
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:apps:write"],
        now()
      );
      const params = DeveloperAppParamsSchema.safeParse(request.params);
      if (!params.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing or invalid public app id.",
          statusCode: 400,
          details: params.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const parsed = UpdateDeveloperAppRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid developer app update request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      return await repository.updateApp({
        developerId: developerIdFilter(auth),
        publicAppId: params.data.publicAppId,
        name: parsed.data.name,
        vertical: parsed.data.vertical,
        defaultRevenueShareBps: parsed.data.default_revenue_share_bps,
        status: parsed.data.status,
        now: now()
      });
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.delete("/v1/developer/apps/:publicAppId", async (request, reply) => {
    try {
      const repository = requireDeveloperConsoleSupport(options);
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:apps:write"],
        now()
      );
      const params = DeveloperAppParamsSchema.safeParse(request.params);
      if (!params.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing or invalid public app id.",
          statusCode: 400,
          details: params.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      return await repository.archiveApp(
        params.data.publicAppId,
        now(),
        developerIdFilter(auth)
      );
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.get("/v1/developer/apps/:publicAppId/features", async (request, reply) => {
    try {
      const repository = requireDeveloperConsoleSupport(options);
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:features:read"],
        now()
      );
      const params = DeveloperAppParamsSchema.safeParse(request.params);
      if (!params.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing or invalid public app id.",
          statusCode: 400,
          details: params.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const items = await repository.listFeatures(
        params.data.publicAppId,
        developerIdFilter(auth)
      );
      return { items };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.post("/v1/developer/apps/:publicAppId/features", async (request, reply) => {
    try {
      const repository = requireDeveloperConsoleSupport(options);
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:features:write"],
        now()
      );
      const params = DeveloperAppParamsSchema.safeParse(request.params);
      if (!params.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing or invalid public app id.",
          statusCode: 400,
          details: params.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const parsed = CreateDeveloperFeatureRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid developer feature request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const feature = await repository.createFeature({
        developerId: developerIdFilter(auth),
        publicAppId: params.data.publicAppId,
        featureKey: parsed.data.feature_key,
        displayName: parsed.data.display_name,
        policy: parsed.data.policy,
        pricing: parsed.data.pricing,
        now: now()
      });
      return reply.code(201).send(feature);
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  app.patch(
    "/v1/developer/apps/:publicAppId/features/:featureKey",
    async (request, reply) => {
      try {
        const repository = requireDeveloperConsoleSupport(options);
        const auth = await requireDeveloperAuth(
          request,
          options,
          ["developer:features:write"],
          now()
        );
        const params = DeveloperFeatureParamsSchema.safeParse(request.params);
        if (!params.success) {
          const error = new ModelFaucetError({
            code: "invalid_request",
            message: "Missing or invalid feature route parameters.",
            statusCode: 400,
            details: params.error.flatten()
          });
          return reply.code(error.statusCode).send(createErrorResponse(error));
        }

        const parsed = UpdateDeveloperFeatureRequestSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          const error = new ModelFaucetError({
            code: "invalid_request",
            message: "Invalid developer feature update request.",
            statusCode: 400,
            details: parsed.error.flatten()
          });
          return reply.code(error.statusCode).send(createErrorResponse(error));
        }

        return await repository.updateFeature({
          developerId: developerIdFilter(auth),
          publicAppId: params.data.publicAppId,
          featureKey: params.data.featureKey,
          displayName: parsed.data.display_name,
          policy: parsed.data.policy,
          pricing: parsed.data.pricing,
          now: now()
        });
      } catch (error) {
        const modelFaucetError = toModelFaucetError(error);
        return reply
          .code(modelFaucetError.statusCode)
          .send(createErrorResponse(modelFaucetError));
      }
    }
  );

  app.delete(
    "/v1/developer/apps/:publicAppId/features/:featureKey",
    async (request, reply) => {
      try {
        const repository = requireDeveloperConsoleSupport(options);
        const auth = await requireDeveloperAuth(
          request,
          options,
          ["developer:features:write"],
          now()
        );
        const params = DeveloperFeatureParamsSchema.safeParse(request.params);
        if (!params.success) {
          const error = new ModelFaucetError({
            code: "invalid_request",
            message: "Missing or invalid feature route parameters.",
            statusCode: 400,
            details: params.error.flatten()
          });
          return reply.code(error.statusCode).send(createErrorResponse(error));
        }

        await repository.deleteFeature(
          params.data.publicAppId,
          params.data.featureKey,
          developerIdFilter(auth)
        );
        return { ok: true };
      } catch (error) {
        const modelFaucetError = toModelFaucetError(error);
        return reply
          .code(modelFaucetError.statusCode)
          .send(createErrorResponse(modelFaucetError));
      }
    }
  );

  app.get("/v1/developer/operations", async (request, reply) => {
    try {
      const repository = requireDeveloperConsoleSupport(options);
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:operations:read"],
        now()
      );
      return await repository.getOperations(developerIdFilter(auth));
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
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:provider_keys:write"],
        now()
      );
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
        developerId: developerIdFilter(auth),
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
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:provider_keys:read"],
        now()
      );
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
        query.data.public_app_id,
        developerIdFilter(auth)
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
      const auth = await requireDeveloperAuth(
        request,
        options,
        ["developer:provider_keys:write"],
        now()
      );
      const params = request.params as { credentialId?: string };
      if (params.credentialId === undefined || params.credentialId.length === 0) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing developer provider key id.",
          statusCode: 400
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      await support.providerKeyRepository.disableDeveloperProviderKey(
        params.credentialId,
        developerIdFilter(auth)
      );
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
