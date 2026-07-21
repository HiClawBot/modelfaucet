import { createHash } from "node:crypto";
import {
  ModelFaucetError,
  calculateTokenCostUsd,
  parseMoneyToUnits,
  pricePlatformUsage,
  priceZeroUpstreamUsage,
  type ChatCompletionRequest,
  type JsonObject,
  type ModelFaucetErrorCode,
  type RatedUsage,
  type RouteMode
} from "@modelfaucet/shared";
import pg from "pg";
import { createGatewayRequestId } from "../crypto";
import type {
  CompletionProvider,
  ProviderCompletionResult,
  ProviderHealthResult
} from "../litellm";
import { decryptSecret } from "../secretEncryption";

const { Pool } = pg;

const PLATFORM_WALLET_OWNER_ID = "00000000-0000-0000-0000-000000000001";
const PROVIDER_COST_WALLET_OWNER_ID = "00000000-0000-0000-0000-000000000002";
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export type GatewayBillingPolicy = {
  platformModel: string;
  inputPricePer1mTokensUsd: string;
  outputPricePer1mTokensUsd: string;
  markupPercent: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  reservationTtlMs: number;
};

const defaultBillingPolicy: GatewayBillingPolicy = {
  platformModel: "auto-text",
  inputPricePer1mTokensUsd: "1.00000000",
  outputPricePer1mTokensUsd: "2.00000000",
  markupPercent: 30,
  maxInputTokens: 8192,
  maxOutputTokens: 1024,
  reservationTtlMs: 120_000
};

export type CreateMockCompletionInput = {
  sessionTokenHash: string;
  request: ChatCompletionRequest;
  createdAt: Date;
  idempotencyKey: string;
};

export type MockCompletionResult = {
  requestId: string;
  routeMode: RouteMode;
  featureKey?: string;
  model: string;
  messageContent: string;
  promptTokens: number;
  completionTokens: number;
  estimatedPriceUsd: string;
};

export type MockCompletionRepository = {
  createMockCompletion(input: CreateMockCompletionInput): Promise<MockCompletionResult>;
  checkHealth?(): Promise<void>;
  checkProviderHealth?(): Promise<ProviderHealthResult>;
  close?(): Promise<void>;
};

type SessionRow = {
  id: string;
  app_id: string;
  developer_id: string;
  end_user_id: string;
  feature_key: string | null;
  expires_at: Date;
  default_revenue_share_bps: number;
  monthly_spend_limit_usd: string | null;
  session_spend_limit_usd: string | null;
};

type IdRow = {
  id: string;
};

type FeatureRow = {
  id: string;
  policy: JsonObject;
};

type WalletRow = {
  id: string;
  balance_usd: string;
  reserved_balance_usd: string;
};

type ProviderCredentialRow = {
  id: string;
  provider: string;
  base_url: string | null;
  encrypted_secret_ref: string;
  models_allowed: string[] | null;
  budget_limit_usd: string | null;
  fallback_to_platform: boolean;
};

type CompletionRequestRow = {
  request_id: string;
  request_fingerprint: string;
  status: "reserved" | "settled" | "failed" | "requires_review";
  route_mode: Exclude<RouteMode, "local">;
  wallet_id: string;
  reserved_retail_price_usd: string;
  reserved_upstream_cost_usd: string;
  reservation_expires_at: Date;
  result: MockCompletionResult | null;
  failure_code: string | null;
  failure_status: number | null;
  failure_message: string | null;
};

type PreparedCompletion = {
  kind: "prepared";
  requestId: string;
  request: ChatCompletionRequest;
  session: SessionRow;
  featureKey?: string;
  routeMode: Exclude<RouteMode, "local">;
  credential?: ProviderCredentialRow;
  allowPlatformFallback: boolean;
  channelShareBps: number;
  reservedRetailPriceUsd: string;
};

type PrepareResult =
  | PreparedCompletion
  | { kind: "replay"; result: MockCompletionResult }
  | { kind: "error"; error: ModelFaucetError };

function getRequestedFeatureKey(request: ChatCompletionRequest): string | undefined {
  const value = request.metadata?.feature_key;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requestPrefersByok(request: ChatCompletionRequest): boolean {
  const metadata = request.metadata ?? {};
  return metadata.route_mode === "byok" || metadata.route_preference === "byok_first";
}

function requestPrefersDeveloperKey(request: ChatCompletionRequest): boolean {
  const metadata = request.metadata ?? {};
  return (
    metadata.route_mode === "developer_key" ||
    metadata.route_preference === "developer_key_first"
  );
}

export function featurePolicyPrefersByok(policy: JsonObject | undefined): boolean {
  if (policy === undefined) {
    return false;
  }
  if (policy.route_preference === "byok_first" || policy.byok === "byok_first") {
    return true;
  }
  const routePreference = policy.route_preference;
  if (!Array.isArray(routePreference)) {
    return false;
  }
  const byokIndex = routePreference.indexOf("end_user_byok");
  if (byokIndex < 0) {
    return false;
  }
  const platformIndexes = ["platform_pool", "developer_key"]
    .map((route) => routePreference.indexOf(route))
    .filter((index) => index >= 0);
  return platformIndexes.length === 0 || byokIndex < Math.min(...platformIndexes);
}

export function featurePolicyPrefersDeveloperKey(policy: JsonObject | undefined): boolean {
  if (policy === undefined) {
    return false;
  }
  if (
    policy.route_preference === "developer_key_first" ||
    policy.developer_key === "developer_key_first"
  ) {
    return true;
  }
  const routePreference = policy.route_preference;
  if (!Array.isArray(routePreference)) {
    return false;
  }
  const developerKeyIndex = routePreference.indexOf("developer_key");
  if (developerKeyIndex < 0) {
    return false;
  }
  const platformIndex = routePreference.indexOf("platform_pool");
  return platformIndex < 0 || developerKeyIndex < platformIndex;
}

export function featurePolicyAllowsPlatformFallback(policy: JsonObject | undefined): boolean {
  if (policy === undefined) {
    return false;
  }
  return (
    policy.fallback_to_platform === true ||
    policy.provider_fallback === "platform_pool" ||
    policy.provider_fallback === "platform"
  );
}

function isProviderRouteError(error: unknown): boolean {
  return error instanceof ModelFaucetError && error.code === "provider_error";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)])
  );
}

function requestFingerprint(request: ChatCompletionRequest): string {
  return sha256(JSON.stringify(canonicalize(request)));
}

export function estimatePromptTokenUpperBound(request: ChatCompletionRequest): number {
  return request.messages.reduce(
    (total, message) => total + Buffer.byteLength(message.content, "utf8") + 16,
    0
  );
}

function validateBillingPolicy(policy: GatewayBillingPolicy): void {
  parseMoneyToUnits(policy.inputPricePer1mTokensUsd);
  parseMoneyToUnits(policy.outputPricePer1mTokensUsd);
  if (!Number.isFinite(policy.markupPercent) || policy.markupPercent < 0) {
    throw new Error("Gateway markup percent must be non-negative.");
  }
  for (const value of [
    policy.maxInputTokens,
    policy.maxOutputTokens,
    policy.reservationTtlMs
  ]) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error("Gateway token and reservation limits must be positive integers.");
    }
  }
  if (!/^[A-Za-z0-9_.:/-]+$/.test(policy.platformModel)) {
    throw new Error("Gateway platform model contains unsupported characters.");
  }
}

function toStoredFailure(error: unknown): ModelFaucetError {
  if (error instanceof ModelFaucetError) {
    return error;
  }
  return new ModelFaucetError({
    code: "provider_error",
    message: "The provider request failed.",
    statusCode: 502
  });
}

function errorFromStoredRequest(row: CompletionRequestRow): ModelFaucetError {
  const code = row.failure_code as ModelFaucetErrorCode | null;
  return new ModelFaucetError({
    code: code ?? "provider_error",
    message: row.failure_message ?? "The idempotent request previously failed.",
    statusCode: row.failure_status ?? 502,
    requestId: row.request_id,
    details: { idempotent_replay: true }
  });
}

async function ensureWallet(
  client: pg.PoolClient,
  ownerScope: "platform" | "provider_cost" | "developer" | "end_user",
  ownerId: string,
  lock = false
): Promise<WalletRow> {
  await client.query(
    `
      insert into wallets (owner_scope, owner_id, balance_usd)
      values ($1, $2, 0)
      on conflict (owner_scope, owner_id) do nothing
    `,
    [ownerScope, ownerId]
  );
  const result = await client.query<WalletRow>(
    `
      select id, balance_usd::text, reserved_balance_usd::text
      from wallets
      where owner_scope = $1 and owner_id = $2
      ${lock ? "for update" : ""}
    `,
    [ownerScope, ownerId]
  );
  const wallet = result.rows[0];
  if (wallet === undefined) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: `Unable to load ${ownerScope} wallet.`,
      statusCode: 500
    });
  }
  return wallet;
}

async function insertLedgerEntry(input: {
  client: pg.PoolClient;
  walletId: string;
  usageEventId: string;
  direction: "debit" | "credit";
  amountUsd: string;
  reason: string;
}): Promise<void> {
  await input.client.query(
    `
      insert into ledger_entries (wallet_id, usage_event_id, direction, amount_usd, reason)
      values ($1, $2, $3, $4::numeric, $5)
    `,
    [input.walletId, input.usageEventId, input.direction, input.amountUsd, input.reason]
  );
}

export class PostgresMockCompletionRepository implements MockCompletionRepository {
  private readonly pool: pg.Pool;
  private readonly completionProvider: CompletionProvider;
  private readonly secretEncryptionKey: string;
  private readonly billingPolicy: GatewayBillingPolicy;
  private readonly platformOnly: boolean;

  constructor(
    config: pg.PoolConfig,
    completionProvider: CompletionProvider,
    options: {
      secretEncryptionKey?: string;
      billingPolicy?: GatewayBillingPolicy;
      platformOnly?: boolean;
    } = {}
  ) {
    this.pool = new Pool(config);
    this.completionProvider = completionProvider;
    this.secretEncryptionKey = options.secretEncryptionKey ?? "";
    this.billingPolicy = options.billingPolicy ?? defaultBillingPolicy;
    this.platformOnly = options.platformOnly ?? false;
    validateBillingPolicy(this.billingPolicy);
  }

  async createMockCompletion(input: CreateMockCompletionInput): Promise<MockCompletionResult> {
    const prepared = await this.prepareCompletion(input);
    if (prepared.kind === "replay") {
      return prepared.result;
    }
    if (prepared.kind === "error") {
      throw prepared.error;
    }

    let routedCompletion;
    try {
      routedCompletion = await this.createProviderCompletion({
        request: prepared.request,
        featureKey: prepared.featureKey,
        routeMode: prepared.routeMode,
        credential: prepared.credential,
        allowPlatformFallback: prepared.allowPlatformFallback,
        idempotencyKey: prepared.requestId
      });
    } catch (error) {
      try {
        await this.releaseReservation(prepared.requestId, error);
      } catch {
        await this.markRequiresReview(prepared.requestId);
        throw new ModelFaucetError({
          code: "provider_error",
          message: "Provider failed and the wallet reservation requires operator review.",
          statusCode: 502,
          requestId: prepared.requestId
        });
      }
      throw error;
    }

    try {
      return await this.settleCompletion(prepared, routedCompletion);
    } catch (error) {
      await this.markRequiresReview(prepared.requestId);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async checkHealth(): Promise<void> {
    await this.pool.query("select 1");
  }

  async checkProviderHealth(): Promise<ProviderHealthResult> {
    if (this.completionProvider.checkHealth === undefined) {
      return { ok: true, provider: "unknown", latencyMs: 0 };
    }
    return this.completionProvider.checkHealth();
  }

  private async withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async prepareCompletion(input: CreateMockCompletionInput): Promise<PrepareResult> {
    const suppliedIdempotencyKey = input.idempotencyKey.trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(suppliedIdempotencyKey)) {
      throw new ModelFaucetError({
        code: "invalid_request",
        message: "Idempotency-Key must be 8-128 URL-safe characters.",
        statusCode: 400
      });
    }
    const requestId = createGatewayRequestId();
    const idempotencyKeyHash = sha256(suppliedIdempotencyKey);
    const fingerprint = requestFingerprint(input.request);

    return this.withTransaction(async (client) => {
      const session = await this.loadSession(client, input.sessionTokenHash, input.createdAt);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${session.id}:${idempotencyKeyHash}`
      ]);

      const existing = await this.findCompletionRequest(
        client,
        session.id,
        idempotencyKeyHash
      );
      if (existing !== undefined) {
        if (existing.request_fingerprint !== fingerprint) {
          throw new ModelFaucetError({
            code: "invalid_request",
            message: "Idempotency-Key was already used with a different request.",
            statusCode: 409,
            requestId: existing.request_id
          });
        }
        if (existing.status === "settled" && existing.result !== null) {
          return { kind: "replay", result: existing.result };
        }
        if (existing.status === "failed") {
          throw errorFromStoredRequest(existing);
        }
        const stale = existing.reservation_expires_at.getTime() <= input.createdAt.getTime();
        if (stale && existing.status === "reserved") {
          await client.query(
            `
              update gateway_completion_requests
              set status = 'requires_review', updated_at = now()
              where request_id = $1 and status = 'reserved'
            `,
            [existing.request_id]
          );
        }
        return {
          kind: "error",
          error: new ModelFaucetError({
            code: "invalid_request",
            message: stale
              ? "The prior request outcome is uncertain and requires operator review."
              : "An idempotent request with this key is already in progress.",
            statusCode: 409,
            requestId: existing.request_id,
            details: { retryable: !stale }
          })
        };
      }

      if (
        this.platformOnly &&
        (session.monthly_spend_limit_usd === null ||
          session.session_spend_limit_usd === null)
      ) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "The hosted app spend policy is not configured.",
          statusCode: 500
        });
      }
      if (
        session.monthly_spend_limit_usd !== null ||
        session.session_spend_limit_usd !== null
      ) {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
          `app-spend:${session.app_id}`
        ]);
        await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
          `session-spend:${session.id}`
        ]);
      }

      const featureKey = getRequestedFeatureKey(input.request) ?? session.feature_key ?? undefined;
      const featurePolicy = await this.loadFeaturePolicy(client, session.app_id, featureKey);
      const byokIsPreferred =
        !this.platformOnly &&
        (requestPrefersByok(input.request) || featurePolicyPrefersByok(featurePolicy));
      const byokCredential = byokIsPreferred
        ? await this.findActiveByokCredential(client, session.end_user_id)
        : undefined;
      const developerKeyIsPreferred =
        !this.platformOnly &&
        byokCredential === undefined &&
        (requestPrefersDeveloperKey(input.request) ||
          featurePolicyPrefersDeveloperKey(featurePolicy));
      const developerCredential = developerKeyIsPreferred
        ? await this.findActiveDeveloperCredential(client, session.developer_id)
        : undefined;
      const credential = byokCredential ?? developerCredential;
      const routeMode: Exclude<RouteMode, "local"> =
        byokCredential !== undefined
          ? "byok"
          : developerCredential !== undefined
            ? "developer_key"
            : "platform";
      const allowPlatformFallback =
        credential !== undefined &&
        (credential.fallback_to_platform || featurePolicyAllowsPlatformFallback(featurePolicy));
      const normalizedRequest = this.normalizeRequest(
        input.request,
        featureKey,
        routeMode,
        credential
      );
      const reserveAsPlatform = routeMode !== "byok" || allowPlatformFallback;
      const reservedUpstreamCostUsd = reserveAsPlatform
        ? this.calculateUpstreamCost(
            this.billingPolicy.maxInputTokens,
            this.billingPolicy.maxOutputTokens
          )
        : "0.00000000";
      const reserved = reserveAsPlatform
        ? pricePlatformUsage({
            requestId,
            routeMode: routeMode === "developer_key" ? "developer_key" : "platform",
            inputTokens: this.billingPolicy.maxInputTokens,
            outputTokens: this.billingPolicy.maxOutputTokens,
            upstreamCostUsd: reservedUpstreamCostUsd,
            markupPercent: this.billingPolicy.markupPercent,
            channelShareBps: session.default_revenue_share_bps
          })
        : priceZeroUpstreamUsage({
            requestId,
            routeMode: "byok",
            inputTokens: this.billingPolicy.maxInputTokens,
            outputTokens: this.billingPolicy.maxOutputTokens
          });

      await this.assertHostedSpendLimits(
        client,
        session,
        reserved.retail_price_usd,
        input.createdAt
      );

      if (routeMode === "developer_key" && credential !== undefined) {
        await this.assertDeveloperBudget(
          client,
          session.developer_id,
          credential,
          reserved.upstream_cost_usd
        );
      }

      const endUserWallet = await ensureWallet(
        client,
        "end_user",
        session.end_user_id,
        true
      );
      const reservation = await client.query<IdRow>(
        `
          update wallets
          set reserved_balance_usd = reserved_balance_usd + $2::numeric,
              updated_at = now()
          where id = $1
            and balance_usd - reserved_balance_usd >= $2::numeric
          returning id
        `,
        [endUserWallet.id, reserved.retail_price_usd]
      );
      if (reservation.rows[0] === undefined) {
        throw new ModelFaucetError({
          code: "insufficient_balance",
          message: "The end user wallet does not have enough available credits.",
          statusCode: 402
        });
      }

      await client.query(
        `
          insert into gateway_completion_requests (
            request_id,
            session_id,
            app_id,
            developer_id,
            end_user_id,
            idempotency_key_hash,
            request_fingerprint,
            status,
            route_mode,
            provider_credential_id,
            wallet_id,
            reserved_retail_price_usd,
            reserved_upstream_cost_usd,
            reservation_expires_at
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, 'reserved', $8, $9, $10,
            $11::numeric, $12::numeric, $13
          )
        `,
        [
          requestId,
          session.id,
          session.app_id,
          session.developer_id,
          session.end_user_id,
          idempotencyKeyHash,
          fingerprint,
          routeMode,
          credential?.id ?? null,
          endUserWallet.id,
          reserved.retail_price_usd,
          reserved.upstream_cost_usd,
          new Date(input.createdAt.getTime() + this.billingPolicy.reservationTtlMs)
        ]
      );

      return {
        kind: "prepared",
        requestId,
        request: normalizedRequest,
        session,
        featureKey,
        routeMode,
        credential,
        allowPlatformFallback,
        channelShareBps: session.default_revenue_share_bps,
        reservedRetailPriceUsd: reserved.retail_price_usd
      };
    });
  }

  private async loadSession(
    client: pg.PoolClient,
    sessionTokenHash: string,
    createdAt: Date
  ): Promise<SessionRow> {
    const result = await client.query<SessionRow>(
      `
        select
          virtual_sessions.id,
          virtual_sessions.app_id,
          apps.developer_id,
          virtual_sessions.end_user_id,
          virtual_sessions.feature_key,
          virtual_sessions.expires_at,
          apps.default_revenue_share_bps,
          apps.monthly_spend_limit_usd::text,
          apps.session_spend_limit_usd::text
        from virtual_sessions
        join apps on apps.id = virtual_sessions.app_id
        join developers on developers.id = apps.developer_id
        where virtual_sessions.token_hash = $1
          and virtual_sessions.revoked_at is null
          and apps.status = 'active'
          and developers.status = 'active'
      `,
      [sessionTokenHash]
    );
    const session = result.rows[0];
    if (session === undefined) {
      throw new ModelFaucetError({
        code: "invalid_session",
        message: "The session token is invalid.",
        statusCode: 401
      });
    }
    if (session.expires_at.getTime() <= createdAt.getTime()) {
      throw new ModelFaucetError({
        code: "expired_session",
        message: "The session token is expired.",
        statusCode: 401
      });
    }
    if (
      !Number.isInteger(session.default_revenue_share_bps) ||
      session.default_revenue_share_bps < 0 ||
      session.default_revenue_share_bps > 10_000
    ) {
      throw new ModelFaucetError({
        code: "invalid_request",
        message: "The app revenue share policy is invalid.",
        statusCode: 500
      });
    }
    return session;
  }

  private async loadFeaturePolicy(
    client: pg.PoolClient,
    appId: string,
    featureKey: string | undefined
  ): Promise<JsonObject | undefined> {
    if (featureKey === undefined) {
      return undefined;
    }
    const result = await client.query<FeatureRow>(
      "select id, policy from app_features where app_id = $1 and feature_key = $2",
      [appId, featureKey]
    );
    const feature = result.rows[0];
    if (feature === undefined) {
      throw new ModelFaucetError({
        code: "feature_not_found",
        message: "The requested feature key was not found for this app.",
        statusCode: 404
      });
    }
    return feature.policy;
  }

  private async findCompletionRequest(
    client: pg.PoolClient,
    sessionId: string,
    idempotencyKeyHash: string
  ): Promise<CompletionRequestRow | undefined> {
    const result = await client.query<CompletionRequestRow>(
      `
        select
          request_id,
          request_fingerprint,
          status,
          route_mode,
          wallet_id,
          reserved_retail_price_usd::text,
          reserved_upstream_cost_usd::text,
          reservation_expires_at,
          result,
          failure_code,
          failure_status,
          failure_message
        from gateway_completion_requests
        where session_id = $1 and idempotency_key_hash = $2
        for update
      `,
      [sessionId, idempotencyKeyHash]
    );
    return result.rows[0];
  }

  private normalizeRequest(
    request: ChatCompletionRequest,
    featureKey: string | undefined,
    routeMode: Exclude<RouteMode, "local">,
    credential: ProviderCredentialRow | undefined
  ): ChatCompletionRequest {
    const promptUpperBound = estimatePromptTokenUpperBound(request);
    if (promptUpperBound > this.billingPolicy.maxInputTokens) {
      throw new ModelFaucetError({
        code: "invalid_request",
        message: "The prompt exceeds the server-side input token budget.",
        statusCode: 400,
        details: { max_input_tokens: this.billingPolicy.maxInputTokens }
      });
    }
    const maxTokens = request.max_tokens ?? this.billingPolicy.maxOutputTokens;
    if (maxTokens > this.billingPolicy.maxOutputTokens) {
      throw new ModelFaucetError({
        code: "invalid_request",
        message: "max_tokens exceeds the server-side output token budget.",
        statusCode: 400,
        details: { max_output_tokens: this.billingPolicy.maxOutputTokens }
      });
    }

    if (routeMode === "platform") {
      const featureAlias = featureKey === undefined ? "auto-text" : `auto:${featureKey}`;
      if (request.model !== featureAlias && request.model !== "auto-text") {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "The requested model is not allowed by the platform route policy.",
          statusCode: 400,
          details: { allowed_model_alias: featureAlias }
        });
      }
      return { ...request, model: this.billingPolicy.platformModel, max_tokens: maxTokens };
    }

    const modelsAllowed = credential?.models_allowed ?? [];
    if (!request.model.startsWith("auto:") && !modelsAllowed.includes(request.model)) {
      throw new ModelFaucetError({
        code: "invalid_request",
        message: "The requested model is not allowed for this provider credential.",
        statusCode: 400
      });
    }
    if (request.model.startsWith("auto:") && modelsAllowed.length === 0) {
      throw new ModelFaucetError({
        code: "no_available_route",
        message: "The provider credential has no allowed model for automatic routing.",
        statusCode: 400
      });
    }
    return { ...request, max_tokens: maxTokens };
  }

  private calculateUpstreamCost(inputTokens: number, outputTokens: number): string {
    return calculateTokenCostUsd({
      inputTokens,
      outputTokens,
      inputPricePer1mTokensUsd: this.billingPolicy.inputPricePer1mTokensUsd,
      outputPricePer1mTokensUsd: this.billingPolicy.outputPricePer1mTokensUsd
    });
  }

  private rateCompletion(
    prepared: PreparedCompletion,
    routeMode: Exclude<RouteMode, "local">,
    providerCompletion: ProviderCompletionResult
  ): RatedUsage {
    if (
      providerCompletion.promptTokens > this.billingPolicy.maxInputTokens ||
      providerCompletion.completionTokens > this.billingPolicy.maxOutputTokens
    ) {
      throw new ModelFaucetError({
        code: "provider_error",
        message: "Provider usage exceeded the reserved token limits.",
        statusCode: 502,
        requestId: prepared.requestId
      });
    }
    if (routeMode === "byok") {
      return priceZeroUpstreamUsage({
        requestId: prepared.requestId,
        routeMode,
        inputTokens: providerCompletion.promptTokens,
        outputTokens: providerCompletion.completionTokens
      });
    }
    return pricePlatformUsage({
      requestId: prepared.requestId,
      routeMode,
      inputTokens: providerCompletion.promptTokens,
      outputTokens: providerCompletion.completionTokens,
      upstreamCostUsd: this.calculateUpstreamCost(
        providerCompletion.promptTokens,
        providerCompletion.completionTokens
      ),
      markupPercent: this.billingPolicy.markupPercent,
      channelShareBps: prepared.channelShareBps
    });
  }

  private async settleCompletion(
    prepared: PreparedCompletion,
    routed: {
      routeMode: Exclude<RouteMode, "local">;
      credential?: ProviderCredentialRow;
      providerCompletion: ProviderCompletionResult;
      fallback?: JsonObject;
    }
  ): Promise<MockCompletionResult> {
    const rated = this.rateCompletion(prepared, routed.routeMode, routed.providerCompletion);
    if (
      parseMoneyToUnits(rated.retail_price_usd) >
      parseMoneyToUnits(prepared.reservedRetailPriceUsd)
    ) {
      throw new ModelFaucetError({
        code: "provider_error",
        message: "Actual provider usage exceeded the wallet reservation.",
        statusCode: 502,
        requestId: prepared.requestId
      });
    }
    const result: MockCompletionResult = {
      requestId: prepared.requestId,
      routeMode: rated.route_mode,
      featureKey: prepared.featureKey,
      model: routed.providerCompletion.model,
      messageContent: routed.providerCompletion.messageContent,
      promptTokens: routed.providerCompletion.promptTokens,
      completionTokens: routed.providerCompletion.completionTokens,
      estimatedPriceUsd: rated.retail_price_usd
    };

    return this.withTransaction(async (client) => {
      const requestResult = await client.query<CompletionRequestRow>(
        `
          select
            request_id,
            request_fingerprint,
            status,
            route_mode,
            wallet_id,
            reserved_retail_price_usd::text,
            reserved_upstream_cost_usd::text,
            reservation_expires_at,
            result,
            failure_code,
            failure_status,
            failure_message
          from gateway_completion_requests
          where request_id = $1
          for update
        `,
        [prepared.requestId]
      );
      const completionRequest = requestResult.rows[0];
      if (completionRequest === undefined) {
        throw new Error("Completion reservation not found.");
      }
      if (completionRequest.status === "settled" && completionRequest.result !== null) {
        return completionRequest.result;
      }
      if (completionRequest.status !== "reserved") {
        throw new Error(`Completion reservation is ${completionRequest.status}.`);
      }

      const endUserWallet = await ensureWallet(
        client,
        "end_user",
        prepared.session.end_user_id,
        true
      );
      const developerWallet = await ensureWallet(
        client,
        "developer",
        prepared.session.developer_id
      );
      const providerCostWallet = await ensureWallet(
        client,
        "provider_cost",
        PROVIDER_COST_WALLET_OWNER_ID
      );
      const platformWallet = await ensureWallet(
        client,
        "platform",
        PLATFORM_WALLET_OWNER_ID
      );

      const usageResult = await client.query<IdRow>(
        `
          insert into usage_events (
            request_id, app_id, developer_id, end_user_id, feature_key, route_mode,
            provider, model, input_tokens, output_tokens, cached_tokens,
            upstream_cost_usd, retail_price_usd, gross_margin_usd,
            channel_revenue_usd, platform_revenue_usd, metadata
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12::numeric, $13::numeric, $14::numeric, $15::numeric, $16::numeric, $17::jsonb
          )
          returning id
        `,
        [
          prepared.requestId,
          prepared.session.app_id,
          prepared.session.developer_id,
          prepared.session.end_user_id,
          prepared.featureKey ?? null,
          rated.route_mode,
          routed.providerCompletion.provider,
          routed.providerCompletion.model,
          rated.input_tokens,
          rated.output_tokens,
          rated.cached_tokens,
          rated.upstream_cost_usd,
          rated.retail_price_usd,
          rated.gross_margin_usd,
          rated.channel_revenue_usd,
          rated.platform_revenue_usd,
          JSON.stringify({
            source:
              routed.routeMode === "byok"
                ? "gateway_byok"
                : routed.routeMode === "developer_key"
                  ? "gateway_developer_key"
                  : "gateway_litellm",
            provider_credential_id: routed.credential?.id,
            credential_owner_scope:
              routed.routeMode === "byok"
                ? "end_user"
                : routed.routeMode === "developer_key"
                  ? "developer"
                  : undefined,
            provider_fallback: routed.fallback,
            provider_attempts: routed.providerCompletion.attempts,
            usage_source: routed.providerCompletion.usageSource,
            usage_warnings: routed.providerCompletion.usageWarnings
          })
        ]
      );
      const usageEvent = usageResult.rows[0];
      if (usageEvent === undefined) {
        throw new Error("Unable to write usage event.");
      }

      await insertLedgerEntry({
        client,
        walletId: endUserWallet.id,
        usageEventId: usageEvent.id,
        direction: "debit",
        amountUsd: rated.retail_price_usd,
        reason: "chat_completion_retail_price"
      });
      await insertLedgerEntry({
        client,
        walletId: providerCostWallet.id,
        usageEventId: usageEvent.id,
        direction: "credit",
        amountUsd: rated.upstream_cost_usd,
        reason: "chat_completion_provider_cost"
      });
      await insertLedgerEntry({
        client,
        walletId: developerWallet.id,
        usageEventId: usageEvent.id,
        direction: "credit",
        amountUsd: rated.channel_revenue_usd,
        reason: "chat_completion_channel_revenue"
      });
      await insertLedgerEntry({
        client,
        walletId: platformWallet.id,
        usageEventId: usageEvent.id,
        direction: "credit",
        amountUsd: rated.platform_revenue_usd,
        reason: "chat_completion_platform_revenue"
      });

      const debit = await client.query<IdRow>(
        `
          update wallets
          set balance_usd = balance_usd - $2::numeric,
              reserved_balance_usd = reserved_balance_usd - $3::numeric,
              updated_at = now()
          where id = $1
            and balance_usd >= $2::numeric
            and reserved_balance_usd >= $3::numeric
          returning id
        `,
        [endUserWallet.id, rated.retail_price_usd, completionRequest.reserved_retail_price_usd]
      );
      if (debit.rows[0] === undefined) {
        throw new Error("Unable to settle the reserved end-user wallet balance.");
      }
      await client.query(
        "update wallets set balance_usd = balance_usd + $2::numeric, updated_at = now() where id = $1",
        [providerCostWallet.id, rated.upstream_cost_usd]
      );
      await client.query(
        "update wallets set balance_usd = balance_usd + $2::numeric, updated_at = now() where id = $1",
        [developerWallet.id, rated.channel_revenue_usd]
      );
      await client.query(
        "update wallets set balance_usd = balance_usd + $2::numeric, updated_at = now() where id = $1",
        [platformWallet.id, rated.platform_revenue_usd]
      );
      await client.query(
        `
          update gateway_completion_requests
          set status = 'settled', result = $2::jsonb, settled_at = now(), updated_at = now()
          where request_id = $1
        `,
        [prepared.requestId, JSON.stringify(result)]
      );
      return result;
    });
  }

  private async releaseReservation(requestId: string, error: unknown): Promise<void> {
    const failure = toStoredFailure(error);
    await this.withTransaction(async (client) => {
      const result = await client.query<CompletionRequestRow>(
        `
          select
            request_id, request_fingerprint, status, route_mode, wallet_id,
            reserved_retail_price_usd::text, reserved_upstream_cost_usd::text,
            reservation_expires_at, result, failure_code, failure_status, failure_message
          from gateway_completion_requests
          where request_id = $1
          for update
        `,
        [requestId]
      );
      const request = result.rows[0];
      if (request === undefined || request.status !== "reserved") {
        return;
      }
      const released = await client.query<IdRow>(
        `
          update wallets
          set reserved_balance_usd = reserved_balance_usd - $2::numeric,
              updated_at = now()
          where id = $1 and reserved_balance_usd >= $2::numeric
          returning id
        `,
        [request.wallet_id, request.reserved_retail_price_usd]
      );
      if (released.rows[0] === undefined) {
        throw new Error("Unable to release the wallet reservation.");
      }
      await client.query(
        `
          update gateway_completion_requests
          set status = 'failed', failure_code = $2, failure_status = $3,
              failure_message = $4, updated_at = now()
          where request_id = $1
        `,
        [requestId, failure.code, failure.statusCode, failure.message]
      );
    });
  }

  private async markRequiresReview(requestId: string): Promise<void> {
    await this.pool.query(
      `
        update gateway_completion_requests
        set status = 'requires_review', updated_at = now()
        where request_id = $1 and status = 'reserved'
      `,
      [requestId]
    );
  }

  private async createProviderCompletion(input: {
    request: ChatCompletionRequest;
    featureKey?: string;
    routeMode: Exclude<RouteMode, "local">;
    credential?: ProviderCredentialRow;
    allowPlatformFallback: boolean;
    idempotencyKey: string;
  }): Promise<{
    routeMode: Exclude<RouteMode, "local">;
    credential?: ProviderCredentialRow;
    providerCompletion: ProviderCompletionResult;
    fallback?: JsonObject;
  }> {
    try {
      return {
        routeMode: input.routeMode,
        credential: input.credential,
        providerCompletion: await this.completionProvider.createChatCompletion({
          request: input.request,
          featureKey: input.featureKey,
          providerCredential: this.toProviderCredentialContext(input.credential),
          idempotencyKey: input.idempotencyKey
        })
      };
    } catch (error) {
      if (
        input.credential === undefined ||
        !input.allowPlatformFallback ||
        !isProviderRouteError(error)
      ) {
        throw error;
      }
      return {
        routeMode: "platform",
        providerCompletion: await this.completionProvider.createChatCompletion({
          request: { ...input.request, model: this.billingPolicy.platformModel },
          featureKey: input.featureKey,
          idempotencyKey: `${input.idempotencyKey}:fallback`
        }),
        fallback: {
          from_route_mode: input.routeMode,
          from_provider: input.credential.provider,
          provider_credential_id: input.credential.id,
          reason: "provider_error"
        }
      };
    }
  }

  private toProviderCredentialContext(credential: ProviderCredentialRow | undefined):
    | {
        provider: string;
        apiKey: string;
        baseUrl?: string;
        modelsAllowed: string[];
      }
    | undefined {
    if (credential === undefined) {
      return undefined;
    }
    return {
      provider: credential.provider,
      apiKey: decryptSecret(credential.encrypted_secret_ref, this.secretEncryptionKey),
      baseUrl: credential.base_url ?? undefined,
      modelsAllowed: credential.models_allowed ?? []
    };
  }

  private async findActiveByokCredential(
    client: pg.PoolClient,
    endUserId: string
  ): Promise<ProviderCredentialRow | undefined> {
    const result = await client.query<ProviderCredentialRow>(
      `
        select id, provider, base_url, encrypted_secret_ref, models_allowed,
               budget_limit_usd::text, fallback_to_platform
        from provider_credentials
        where owner_scope = 'end_user' and owner_id = $1 and status = 'active'
        order by priority asc, created_at desc
        limit 1
        for update
      `,
      [endUserId]
    );
    return result.rows[0];
  }

  private async findActiveDeveloperCredential(
    client: pg.PoolClient,
    developerId: string
  ): Promise<ProviderCredentialRow | undefined> {
    const result = await client.query<ProviderCredentialRow>(
      `
        select id, provider, base_url, encrypted_secret_ref, models_allowed,
               budget_limit_usd::text, fallback_to_platform
        from provider_credentials
        where owner_scope = 'developer' and owner_id = $1 and status = 'active'
        order by priority asc, created_at desc
        limit 1
        for update
      `,
      [developerId]
    );
    return result.rows[0];
  }

  private async assertDeveloperBudget(
    client: pg.PoolClient,
    developerId: string,
    credential: ProviderCredentialRow,
    reservedUpstreamCostUsd: string
  ): Promise<void> {
    if (credential.budget_limit_usd === null) {
      return;
    }
    const spentResult = await client.query<{ spent_usd: string; reserved_usd: string }>(
      `
        select
          coalesce((
            select sum(upstream_cost_usd)
            from usage_events
            where developer_id = $1
              and route_mode = 'developer_key'
              and metadata->>'provider_credential_id' = $2
          ), 0)::text as spent_usd,
          coalesce((
            select sum(reserved_upstream_cost_usd)
            from gateway_completion_requests
            where developer_id = $1
              and provider_credential_id = $2::uuid
              and status = 'reserved'
          ), 0)::text as reserved_usd
      `,
      [developerId, credential.id]
    );
    const row = spentResult.rows[0];
    const totalAfterReservation =
      parseMoneyToUnits(row?.spent_usd ?? "0") +
      parseMoneyToUnits(row?.reserved_usd ?? "0") +
      parseMoneyToUnits(reservedUpstreamCostUsd);
    if (totalAfterReservation > parseMoneyToUnits(credential.budget_limit_usd)) {
      throw new ModelFaucetError({
        code: "budget_exceeded",
        message: "Developer provider key budget limit exceeded.",
        statusCode: 402
      });
    }
  }

  private async assertHostedSpendLimits(
    client: pg.PoolClient,
    session: SessionRow,
    reservedRetailPriceUsd: string,
    createdAt: Date
  ): Promise<void> {
    const reservation = parseMoneyToUnits(reservedRetailPriceUsd);
    if (session.monthly_spend_limit_usd !== null) {
      const appSpend = await client.query<{ spent_usd: string; reserved_usd: string }>(
        `
          select
            coalesce((
              select sum(retail_price_usd)
              from usage_events
              where app_id = $1
                and created_at >= date_trunc('month', $2::timestamptz)
            ), 0)::text as spent_usd,
            coalesce((
              select sum(reserved_retail_price_usd)
              from gateway_completion_requests
              where app_id = $1
                and status in ('reserved', 'requires_review')
                and created_at >= date_trunc('month', $2::timestamptz)
            ), 0)::text as reserved_usd
        `,
        [session.app_id, createdAt]
      );
      const row = appSpend.rows[0];
      const total =
        parseMoneyToUnits(row?.spent_usd ?? "0") +
        parseMoneyToUnits(row?.reserved_usd ?? "0") +
        reservation;
      if (total > parseMoneyToUnits(session.monthly_spend_limit_usd)) {
        throw new ModelFaucetError({
          code: "budget_exceeded",
          message: "The app monthly spend limit would be exceeded.",
          statusCode: 402
        });
      }
    }

    if (session.session_spend_limit_usd !== null) {
      const sessionSpend = await client.query<{ committed_usd: string }>(
        `
          select coalesce(sum(
            case
              when status = 'settled' and result ? 'estimatedPriceUsd'
                then (result->>'estimatedPriceUsd')::numeric
              when status in ('reserved', 'requires_review')
                then reserved_retail_price_usd
              else 0
            end
          ), 0)::text as committed_usd
          from gateway_completion_requests
          where session_id = $1
        `,
        [session.id]
      );
      const total =
        parseMoneyToUnits(sessionSpend.rows[0]?.committed_usd ?? "0") + reservation;
      if (total > parseMoneyToUnits(session.session_spend_limit_usd)) {
        throw new ModelFaucetError({
          code: "budget_exceeded",
          message: "The session spend limit would be exceeded.",
          statusCode: 402
        });
      }
    }
  }
}
