import {
  ModelFaucetError,
  parseMoneyToUnits,
  pricePlatformUsage,
  priceZeroUpstreamUsage,
  type ChatCompletionRequest,
  type JsonObject,
  type RouteMode
} from "@modelfaucet/shared";
import pg from "pg";
import { createGatewayRequestId } from "../crypto";
import type { CompletionProvider } from "../litellm";
import { decryptSecret } from "../secretEncryption";

const { Pool } = pg;

const PLATFORM_WALLET_OWNER_ID = "00000000-0000-0000-0000-000000000001";
const PROVIDER_COST_WALLET_OWNER_ID = "00000000-0000-0000-0000-000000000002";

export type CreateMockCompletionInput = {
  sessionTokenHash: string;
  request: ChatCompletionRequest;
  createdAt: Date;
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
  close?(): Promise<void>;
};

type SessionRow = {
  id: string;
  app_id: string;
  developer_id: string;
  end_user_id: string;
  feature_key: string | null;
  expires_at: Date;
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
};

type ProviderCredentialRow = {
  id: string;
  provider: string;
  base_url: string | null;
  encrypted_secret_ref: string;
  models_allowed: string[] | null;
  budget_limit_usd: string | null;
};

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

async function ensureWallet(
  client: pg.PoolClient,
  ownerScope: "platform" | "provider_cost" | "developer" | "end_user",
  ownerId: string
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
      select id, balance_usd::text
      from wallets
      where owner_scope = $1 and owner_id = $2
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

  constructor(
    config: pg.PoolConfig,
    completionProvider: CompletionProvider,
    options: { secretEncryptionKey?: string } = {}
  ) {
    this.pool = new Pool(config);
    this.completionProvider = completionProvider;
    this.secretEncryptionKey = options.secretEncryptionKey ?? "";
  }

  async createMockCompletion(input: CreateMockCompletionInput): Promise<MockCompletionResult> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const sessionResult = await client.query<SessionRow>(
        `
          select
            virtual_sessions.id,
            virtual_sessions.app_id,
            apps.developer_id,
            virtual_sessions.end_user_id,
            virtual_sessions.feature_key,
            virtual_sessions.expires_at
          from virtual_sessions
          join apps on apps.id = virtual_sessions.app_id
          join developers on developers.id = apps.developer_id
          where
            virtual_sessions.token_hash = $1
            and virtual_sessions.revoked_at is null
            and apps.status = 'active'
            and developers.status = 'active'
        `,
        [input.sessionTokenHash]
      );
      const session = sessionResult.rows[0];
      if (session === undefined) {
        throw new ModelFaucetError({
          code: "invalid_session",
          message: "The session token is invalid.",
          statusCode: 401
        });
      }

      if (session.expires_at.getTime() <= input.createdAt.getTime()) {
        throw new ModelFaucetError({
          code: "expired_session",
          message: "The session token is expired.",
          statusCode: 401
        });
      }

      const featureKey = getRequestedFeatureKey(input.request) ?? session.feature_key ?? undefined;
      let featurePolicy: JsonObject | undefined;
      if (featureKey !== undefined) {
        const featureResult = await client.query<FeatureRow>(
          "select id, policy from app_features where app_id = $1 and feature_key = $2",
          [session.app_id, featureKey]
        );
        const feature = featureResult.rows[0];

        if (feature === undefined) {
          throw new ModelFaucetError({
            code: "feature_not_found",
            message: "The requested feature key was not found for this app.",
            statusCode: 404
          });
        }
        featurePolicy = feature.policy;
      }

      const requestId = createGatewayRequestId();
      const byokIsPreferred =
        requestPrefersByok(input.request) || featurePolicyPrefersByok(featurePolicy);
      const byokCredential = byokIsPreferred
        ? await this.findActiveByokCredential(client, session.end_user_id)
        : undefined;
      const developerKeyIsPreferred =
        byokCredential === undefined &&
        (requestPrefersDeveloperKey(input.request) ||
          featurePolicyPrefersDeveloperKey(featurePolicy));
      const developerCredential = developerKeyIsPreferred
        ? await this.findActiveDeveloperCredential(client, session.developer_id)
        : undefined;
      const selectedCredential = byokCredential ?? developerCredential;
      const routeMode: RouteMode =
        byokCredential !== undefined
          ? "byok"
          : developerCredential !== undefined
            ? "developer_key"
            : "platform";
      const providerCompletion = await this.completionProvider.createChatCompletion({
        request: input.request,
        featureKey,
        providerCredential:
          selectedCredential === undefined
            ? undefined
            : {
                provider: selectedCredential.provider,
                apiKey: decryptSecret(
                  selectedCredential.encrypted_secret_ref,
                  this.secretEncryptionKey
                ),
                baseUrl: selectedCredential.base_url ?? undefined,
                modelsAllowed: selectedCredential.models_allowed ?? []
              }
      });
      const promptTokens = providerCompletion.promptTokens;
      const completionTokens = providerCompletion.completionTokens;
      const rated =
        routeMode === "byok"
          ? priceZeroUpstreamUsage({
              requestId,
              routeMode,
              inputTokens: promptTokens,
              outputTokens: completionTokens,
              explicitGatewayFeeUsd: "0",
              channelShareBps: 0
            })
          : pricePlatformUsage({
              requestId,
              routeMode: routeMode === "developer_key" ? "developer_key" : "platform",
              inputTokens: promptTokens,
              outputTokens: completionTokens,
              upstreamCostUsd: "0.00010000",
              markupPercent: 30,
              channelShareBps: 4000
            });

      if (developerCredential !== undefined) {
        await this.assertDeveloperBudget(client, session.developer_id, developerCredential, rated);
      }

      const endUserWallet = await ensureWallet(client, "end_user", session.end_user_id);
      const developerWallet = await ensureWallet(client, "developer", session.developer_id);
      const providerCostWallet = await ensureWallet(
        client,
        "provider_cost",
        PROVIDER_COST_WALLET_OWNER_ID
      );
      const platformWallet = await ensureWallet(client, "platform", PLATFORM_WALLET_OWNER_ID);

      if (
        parseMoneyToUnits(endUserWallet.balance_usd) <
        parseMoneyToUnits(rated.retail_price_usd)
      ) {
        throw new ModelFaucetError({
          code: "insufficient_balance",
          message: "The end user wallet does not have enough credits.",
          statusCode: 402
        });
      }

      const usageResult = await client.query<IdRow>(
        `
          insert into usage_events (
            request_id,
            app_id,
            developer_id,
            end_user_id,
            feature_key,
            route_mode,
            provider,
            model,
            input_tokens,
            output_tokens,
            cached_tokens,
            upstream_cost_usd,
            retail_price_usd,
            gross_margin_usd,
            channel_revenue_usd,
            platform_revenue_usd,
            metadata
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12::numeric, $13::numeric, $14::numeric, $15::numeric, $16::numeric, $17::jsonb
          )
          returning id
        `,
        [
          requestId,
          session.app_id,
          session.developer_id,
          session.end_user_id,
          featureKey ?? null,
          rated.route_mode,
          providerCompletion.provider,
          providerCompletion.model,
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
              routeMode === "byok"
                ? "gateway_byok"
                : routeMode === "developer_key"
                  ? "gateway_developer_key"
                  : "gateway_litellm",
            provider_credential_id: selectedCredential?.id,
            credential_owner_scope:
              routeMode === "byok"
                ? "end_user"
                : routeMode === "developer_key"
                  ? "developer"
                  : undefined
          })
        ]
      );
      const usageEvent = usageResult.rows[0];
      if (usageEvent === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Unable to write usage event.",
          statusCode: 500
        });
      }

      await insertLedgerEntry({
        client,
        walletId: endUserWallet.id,
        usageEventId: usageEvent.id,
        direction: "debit",
        amountUsd: rated.retail_price_usd,
        reason: "mock_chat_completion_retail_price"
      });
      await insertLedgerEntry({
        client,
        walletId: providerCostWallet.id,
        usageEventId: usageEvent.id,
        direction: "credit",
        amountUsd: rated.upstream_cost_usd,
        reason: "mock_chat_completion_provider_cost"
      });
      await insertLedgerEntry({
        client,
        walletId: developerWallet.id,
        usageEventId: usageEvent.id,
        direction: "credit",
        amountUsd: rated.channel_revenue_usd,
        reason: "mock_chat_completion_channel_revenue"
      });
      await insertLedgerEntry({
        client,
        walletId: platformWallet.id,
        usageEventId: usageEvent.id,
        direction: "credit",
        amountUsd: rated.platform_revenue_usd,
        reason: "mock_chat_completion_platform_revenue"
      });

      await client.query(
        "update wallets set balance_usd = balance_usd - $2::numeric, updated_at = now() where id = $1",
        [endUserWallet.id, rated.retail_price_usd]
      );
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

      await client.query("commit");

      return {
        requestId,
        routeMode: rated.route_mode,
        featureKey,
        model: providerCompletion.model,
        messageContent: providerCompletion.messageContent,
        promptTokens,
        completionTokens,
        estimatedPriceUsd: rated.retail_price_usd
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async findActiveByokCredential(
    client: pg.PoolClient,
    endUserId: string
  ): Promise<ProviderCredentialRow | undefined> {
    const result = await client.query<ProviderCredentialRow>(
      `
        select
          id,
          provider,
          base_url,
          encrypted_secret_ref,
          models_allowed,
          budget_limit_usd::text
        from provider_credentials
        where
          owner_scope = 'end_user'
          and owner_id = $1
          and status = 'active'
        order by priority asc, created_at desc
        limit 1
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
        select
          id,
          provider,
          base_url,
          encrypted_secret_ref,
          models_allowed,
          budget_limit_usd::text
        from provider_credentials
        where
          owner_scope = 'developer'
          and owner_id = $1
          and status = 'active'
        order by priority asc, created_at desc
        limit 1
      `,
      [developerId]
    );

    return result.rows[0];
  }

  private async assertDeveloperBudget(
    client: pg.PoolClient,
    developerId: string,
    credential: ProviderCredentialRow,
    rated: { upstream_cost_usd: string }
  ): Promise<void> {
    if (credential.budget_limit_usd === null) {
      return;
    }

    const spentResult = await client.query<{ spent_usd: string }>(
      `
        select coalesce(sum(upstream_cost_usd), 0)::text as spent_usd
        from usage_events
        where
          developer_id = $1
          and route_mode = 'developer_key'
          and metadata->>'provider_credential_id' = $2
      `,
      [developerId, credential.id]
    );
    const spentUsd = spentResult.rows[0]?.spent_usd ?? "0";
    const totalAfterThisRequest =
      parseMoneyToUnits(spentUsd) + parseMoneyToUnits(rated.upstream_cost_usd);

    if (totalAfterThisRequest > parseMoneyToUnits(credential.budget_limit_usd)) {
      throw new ModelFaucetError({
        code: "budget_exceeded",
        message: "Developer provider key budget limit exceeded.",
        statusCode: 402
      });
    }
  }
}
