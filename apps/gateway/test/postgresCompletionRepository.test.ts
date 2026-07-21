import { randomUUID } from "node:crypto";
import { ModelFaucetError, calculateTokenCostUsd, pricePlatformUsage } from "@modelfaucet/shared";
import pg from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  PostgresMockCompletionRepository,
  type CompletionProvider,
  type GatewayBillingPolicy,
  type ProviderCompletionResult
} from "../src/index";

const databaseUrl = process.env.DATABASE_URL;
const { Pool } = pg;
const adminPool = databaseUrl === undefined ? undefined : new Pool({ connectionString: databaseUrl });
const createdDeveloperIds: string[] = [];

const billingPolicy: GatewayBillingPolicy = {
  platformModel: "auto-text",
  inputPricePer1mTokensUsd: "1.00000000",
  outputPricePer1mTokensUsd: "2.00000000",
  markupPercent: 30,
  maxInputTokens: 128,
  maxOutputTokens: 32,
  reservationTtlMs: 60_000
};

const reservedUpstreamCost = calculateTokenCostUsd({
  inputTokens: billingPolicy.maxInputTokens,
  outputTokens: billingPolicy.maxOutputTokens,
  inputPricePer1mTokensUsd: billingPolicy.inputPricePer1mTokensUsd,
  outputPricePer1mTokensUsd: billingPolicy.outputPricePer1mTokensUsd
});
const reservedRetailPrice = pricePlatformUsage({
  requestId: "req_reservation_test",
  inputTokens: billingPolicy.maxInputTokens,
  outputTokens: billingPolicy.maxOutputTokens,
  upstreamCostUsd: reservedUpstreamCost,
  markupPercent: billingPolicy.markupPercent,
  channelShareBps: 4000
}).retail_price_usd;

type Fixture = {
  developerId: string;
  appId: string;
  endUserId: string;
  sessionTokenHash: string;
  walletId: string;
  applicationName: string;
};

function providerResult(overrides: Partial<ProviderCompletionResult> = {}): ProviderCompletionResult {
  return {
    provider: "litellm",
    model: "auto-text",
    messageContent: "A safe provider response.",
    promptTokens: 10,
    completionTokens: 20,
    attempts: [{ attempt: 1, provider: "litellm", statusCode: 200, retryable: false, durationMs: 1 }],
    usageSource: "provider",
    usageWarnings: [],
    ...overrides
  };
}

async function createFixture(balanceUsd = "1.00000000"): Promise<Fixture> {
  if (adminPool === undefined) {
    throw new Error("DATABASE_URL is required for PostgreSQL repository tests.");
  }
  const suffix = randomUUID().replaceAll("-", "");
  const developer = await adminPool.query<{ id: string }>(
    "insert into developers(name, email) values ($1, $2) returning id",
    [`Gateway Test ${suffix}`, `gateway-${suffix}@example.invalid`]
  );
  const developerId = developer.rows[0]?.id;
  if (developerId === undefined) {
    throw new Error("Unable to create test developer.");
  }
  createdDeveloperIds.push(developerId);
  const app = await adminPool.query<{ id: string }>(
    `
      insert into apps(
        developer_id, public_app_id, name, default_revenue_share_bps,
        monthly_spend_limit_usd, session_spend_limit_usd
      )
      values ($1, $2, $3, 4000, 1000, 100)
      returning id
    `,
    [developerId, `app_gateway_${suffix}`, `Gateway App ${suffix}`]
  );
  const appId = app.rows[0]?.id;
  if (appId === undefined) {
    throw new Error("Unable to create test app.");
  }
  await adminPool.query(
    `
      insert into app_features(app_id, feature_key, display_name, policy, pricing)
      values ($1, 'customer_reply', 'Customer reply', '{}'::jsonb, '{}'::jsonb)
    `,
    [appId]
  );
  const endUser = await adminPool.query<{ id: string }>(
    `
      insert into end_users(app_id, external_user_hash)
      values ($1, $2)
      returning id
    `,
    [appId, `sha256:${suffix}`]
  );
  const endUserId = endUser.rows[0]?.id;
  if (endUserId === undefined) {
    throw new Error("Unable to create test end user.");
  }
  const sessionTokenHash = `session_hash_${suffix}`;
  await adminPool.query(
    `
      insert into virtual_sessions(app_id, end_user_id, token_hash, feature_key, expires_at)
      values ($1, $2, $3, 'customer_reply', now() + interval '1 hour')
    `,
    [appId, endUserId, sessionTokenHash]
  );
  const wallet = await adminPool.query<{ id: string }>(
    `
      insert into wallets(owner_scope, owner_id, balance_usd)
      values ('end_user', $1, $2::numeric)
      returning id
    `,
    [endUserId, balanceUsd]
  );
  const walletId = wallet.rows[0]?.id;
  if (walletId === undefined) {
    throw new Error("Unable to create test wallet.");
  }
  return {
    developerId,
    appId,
    endUserId,
    sessionTokenHash,
    walletId,
    applicationName: `mf_gateway_test_${suffix}`
  };
}

function createRepository(
  fixture: Fixture,
  completionProvider: CompletionProvider,
  options: { platformOnly?: boolean } = {}
): PostgresMockCompletionRepository {
  return new PostgresMockCompletionRepository(
    {
      connectionString: databaseUrl,
      application_name: fixture.applicationName
    },
    completionProvider,
    { billingPolicy, platformOnly: options.platformOnly }
  );
}

function completionInput(fixture: Fixture, idempotencyKey: string) {
  return {
    sessionTokenHash: fixture.sessionTokenHash,
    idempotencyKey,
    createdAt: new Date(),
    request: {
      model: "auto:customer_reply",
      messages: [{ role: "user" as const, content: "Draft a reply." }],
      max_tokens: 32,
      metadata: { feature_key: "customer_reply" }
    }
  };
}

function deferredProvider() {
  let resolveResult: ((value: ProviderCompletionResult) => void) | undefined;
  let notifyStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve;
  });
  const pending = new Promise<ProviderCompletionResult>((resolve) => {
    resolveResult = resolve;
  });
  const createChatCompletion = vi.fn(async () => {
    notifyStarted?.();
    return pending;
  });
  return {
    provider: { createChatCompletion } satisfies CompletionProvider,
    started,
    resolve(value = providerResult()) {
      resolveResult?.(value);
    }
  };
}

afterAll(async () => {
  if (adminPool === undefined) {
    return;
  }
  for (const developerId of createdDeveloperIds) {
    await adminPool.query(
      `delete from ledger_entries where usage_event_id in (
        select id from usage_events where developer_id = $1
      )`,
      [developerId]
    );
    await adminPool.query(
      `
        update wallets
        set balance_usd = balance_usd - coalesce((
          select sum(upstream_cost_usd) from usage_events where developer_id = $1
        ), 0)
        where owner_scope = 'provider_cost'
          and owner_id = '00000000-0000-0000-0000-000000000002'
      `,
      [developerId]
    );
    await adminPool.query(
      `
        update wallets
        set balance_usd = balance_usd - coalesce((
          select sum(platform_revenue_usd) from usage_events where developer_id = $1
        ), 0)
        where owner_scope = 'platform'
          and owner_id = '00000000-0000-0000-0000-000000000001'
      `,
      [developerId]
    );
    const cleanupQueries = [
      "delete from usage_events where developer_id = $1",
      "delete from gateway_completion_requests where developer_id = $1",
      `delete from ledger_entries where wallet_id in (
        select id from wallets where owner_id in (
          select id from end_users where app_id in (select id from apps where developer_id = $1)
        )
      )`,
      `delete from wallets where owner_id in (
        select id from end_users where app_id in (select id from apps where developer_id = $1)
      )`,
      "delete from wallets where owner_scope = 'developer' and owner_id = $1",
      "delete from virtual_sessions where app_id in (select id from apps where developer_id = $1)",
      "delete from app_features where app_id in (select id from apps where developer_id = $1)",
      "delete from provider_credentials where owner_scope = 'developer' and owner_id = $1",
      "delete from end_users where app_id in (select id from apps where developer_id = $1)",
      "delete from apps where developer_id = $1",
      "delete from developers where id = $1"
    ];
    for (const query of cleanupQueries) {
      await adminPool.query(query, [developerId]);
    }
  }
  await adminPool.end();
});

describe.skipIf(databaseUrl === undefined)("PostgresMockCompletionRepository", () => {
  it("does not call the provider when the server-side reservation cannot be funded", async () => {
    const fixture = await createFixture("0.00000000");
    const provider: CompletionProvider = {
      createChatCompletion: vi.fn(async () => providerResult())
    };
    const repository = createRepository(fixture, provider);

    await expect(
      repository.createMockCompletion(completionInput(fixture, "idem_insufficient_balance"))
    ).rejects.toMatchObject({ code: "insufficient_balance", statusCode: 402 });
    expect(provider.createChatCompletion).not.toHaveBeenCalled();
    await repository.close();
  });

  it("runs the provider outside a database transaction", async () => {
    const fixture = await createFixture();
    const deferred = deferredProvider();
    const repository = createRepository(fixture, deferred.provider);
    const completion = repository.createMockCompletion(
      completionInput(fixture, "idem_transaction_boundary")
    );
    await deferred.started;

    const states = await adminPool?.query<{ state: string }>(
      "select state from pg_stat_activity where application_name = $1",
      [fixture.applicationName]
    );
    expect(states?.rows.some((row) => row.state === "idle in transaction")).toBe(false);

    deferred.resolve();
    await expect(completion).resolves.toMatchObject({ routeMode: "platform" });
    await repository.close();
  });

  it("serializes concurrent reservations so only funded work reaches the provider", async () => {
    const fixture = await createFixture(reservedRetailPrice);
    const deferred = deferredProvider();
    const repository = createRepository(fixture, deferred.provider);
    const first = repository.createMockCompletion(
      completionInput(fixture, "idem_concurrent_funded_1")
    );
    await deferred.started;

    await expect(
      repository.createMockCompletion(completionInput(fixture, "idem_concurrent_funded_2"))
    ).rejects.toMatchObject({ code: "insufficient_balance", statusCode: 402 });
    expect(deferred.provider.createChatCompletion).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await first;
    const wallet = await adminPool?.query<{
      balance_usd: string;
      reserved_balance_usd: string;
    }>(
      "select balance_usd::text, reserved_balance_usd::text from wallets where id = $1",
      [fixture.walletId]
    );
    expect(wallet?.rows[0]).toEqual({
      balance_usd: "0.00018460",
      reserved_balance_usd: "0.00000000"
    });
    await repository.close();
  });

  it("keeps wallet and ledger non-negative under 100 concurrent requests", async () => {
    const fixture = await createFixture(reservedRetailPrice);
    await adminPool?.query(
      `
        insert into ledger_entries(wallet_id, direction, amount_usd, reason)
        values ($1, 'credit', $2::numeric, 'gateway_concurrency_fixture_credit')
      `,
      [fixture.walletId, reservedRetailPrice]
    );
    const provider: CompletionProvider = {
      createChatCompletion: vi.fn(async () => providerResult())
    };
    const repository = createRepository(fixture, provider);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 100 }, (_, index) =>
        repository.createMockCompletion(
          completionInput(fixture, `idem_concurrent_${index.toString().padStart(3, "0")}`)
        )
      )
    );

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(99);
    expect(provider.createChatCompletion).toHaveBeenCalledTimes(1);
    const state = await adminPool?.query<{
      balance_usd: string;
      reserved_balance_usd: string;
      ledger_balance_usd: string;
      usage_count: string;
    }>(
      `
        select
          wallets.balance_usd::text,
          wallets.reserved_balance_usd::text,
          coalesce(sum(
            case when ledger_entries.direction = 'credit'
              then ledger_entries.amount_usd else -ledger_entries.amount_usd end
          ), 0)::numeric(18,8)::text as ledger_balance_usd,
          (select count(*) from usage_events where developer_id = $2)::text as usage_count
        from wallets
        left join ledger_entries on ledger_entries.wallet_id = wallets.id
        where wallets.id = $1
        group by wallets.id
      `,
      [fixture.walletId, fixture.developerId]
    );
    expect(state?.rows[0]).toEqual({
      balance_usd: "0.00018460",
      reserved_balance_usd: "0.00000000",
      ledger_balance_usd: "0.00018460",
      usage_count: "1"
    });
    await repository.close();
  });

  it("calls the provider once and replays a settled idempotent result", async () => {
    const fixture = await createFixture();
    const deferred = deferredProvider();
    const repository = createRepository(fixture, deferred.provider);
    const input = completionInput(fixture, "idem_replay_completion");
    const first = repository.createMockCompletion(input);
    await deferred.started;

    await expect(repository.createMockCompletion(input)).rejects.toMatchObject({
      code: "invalid_request",
      statusCode: 409
    });
    deferred.resolve();
    const firstResult = await first;
    await expect(repository.createMockCompletion(input)).resolves.toEqual(firstResult);
    expect(deferred.provider.createChatCompletion).toHaveBeenCalledTimes(1);
    const usageCount = await adminPool?.query<{ count: string }>(
      "select count(*)::text as count from usage_events where request_id = $1",
      [firstResult.requestId]
    );
    expect(usageCount?.rows[0]?.count).toBe("1");
    await repository.close();
  });

  it("releases reservations after provider failure and replays the failure", async () => {
    const fixture = await createFixture();
    const provider: CompletionProvider = {
      createChatCompletion: vi.fn(async () => {
        throw new ModelFaucetError({
          code: "provider_error",
          message: "Provider unavailable.",
          statusCode: 502
        });
      })
    };
    const repository = createRepository(fixture, provider);
    const input = completionInput(fixture, "idem_provider_failure");

    await expect(repository.createMockCompletion(input)).rejects.toMatchObject({
      code: "provider_error"
    });
    await expect(repository.createMockCompletion(input)).rejects.toMatchObject({
      code: "provider_error",
      details: { idempotent_replay: true }
    });
    expect(provider.createChatCompletion).toHaveBeenCalledTimes(1);
    const wallet = await adminPool?.query<{
      balance_usd: string;
      reserved_balance_usd: string;
    }>(
      "select balance_usd::text, reserved_balance_usd::text from wallets where id = $1",
      [fixture.walletId]
    );
    expect(wallet?.rows[0]).toEqual({
      balance_usd: "1.00000000",
      reserved_balance_usd: "0.00000000"
    });
    await repository.close();
  });

  it("rates actual tokens from the authoritative server pricing policy", async () => {
    const fixture = await createFixture();
    const provider: CompletionProvider = {
      createChatCompletion: vi.fn(async () => providerResult())
    };
    const repository = createRepository(fixture, provider);
    const result = await repository.createMockCompletion(
      completionInput(fixture, "idem_server_pricing")
    );
    expect(result.estimatedPriceUsd).toBe("0.00006500");

    const usage = await adminPool?.query<{
      upstream_cost_usd: string;
      retail_price_usd: string;
      channel_revenue_usd: string;
      platform_revenue_usd: string;
    }>(
      `
        select upstream_cost_usd::text, retail_price_usd::text,
               channel_revenue_usd::text, platform_revenue_usd::text
        from usage_events where request_id = $1
      `,
      [result.requestId]
    );
    expect(usage?.rows[0]).toEqual({
      upstream_cost_usd: "0.00005000",
      retail_price_usd: "0.00006500",
      channel_revenue_usd: "0.00000600",
      platform_revenue_usd: "0.00000900"
    });
    await repository.close();
  });

  it("rejects a client-selected platform model before provider execution", async () => {
    const fixture = await createFixture();
    const provider: CompletionProvider = {
      createChatCompletion: vi.fn(async () => providerResult())
    };
    const repository = createRepository(fixture, provider);
    const input = completionInput(fixture, "idem_model_policy");
    input.request.model = "gpt-unapproved";

    await expect(repository.createMockCompletion(input)).rejects.toMatchObject({
      code: "invalid_request",
      statusCode: 400
    });
    expect(provider.createChatCompletion).not.toHaveBeenCalled();
    await repository.close();
  });

  it("reserves developer-key budget before provider execution", async () => {
    const fixture = await createFixture();
    await adminPool?.query(
      `
        update app_features
        set policy = '{"route_preference":["developer_key","platform_pool"]}'::jsonb
        where app_id = $1 and feature_key = 'customer_reply'
      `,
      [fixture.appId]
    );
    await adminPool?.query(
      `
        insert into provider_credentials(
          owner_scope, owner_id, provider, encrypted_secret_ref, models_allowed,
          budget_limit_usd, fallback_to_platform
        )
        values ('developer', $1, 'openai', 'not-read-before-budget-check',
                array['gpt-budget-test'], '0.00000100', false)
      `,
      [fixture.developerId]
    );
    const provider: CompletionProvider = {
      createChatCompletion: vi.fn(async () => providerResult())
    };
    const repository = createRepository(fixture, provider);

    await expect(
      repository.createMockCompletion(completionInput(fixture, "idem_developer_budget"))
    ).rejects.toMatchObject({ code: "budget_exceeded", statusCode: 402 });
    expect(provider.createChatCompletion).not.toHaveBeenCalled();
    await repository.close();
  });

  it("rejects a session spend limit before provider execution", async () => {
    const fixture = await createFixture();
    await adminPool?.query(
      "update apps set session_spend_limit_usd = 0.00000100 where id = $1",
      [fixture.appId]
    );
    const provider: CompletionProvider = {
      createChatCompletion: vi.fn(async () => providerResult())
    };
    const repository = createRepository(fixture, provider);

    await expect(
      repository.createMockCompletion(completionInput(fixture, "idem_session_budget"))
    ).rejects.toMatchObject({ code: "budget_exceeded", statusCode: 402 });
    expect(provider.createChatCompletion).not.toHaveBeenCalled();
    await repository.close();
  });

  it("rejects an app monthly spend limit before provider execution", async () => {
    const fixture = await createFixture();
    await adminPool?.query(
      "update apps set monthly_spend_limit_usd = 0.00000100 where id = $1",
      [fixture.appId]
    );
    const provider: CompletionProvider = {
      createChatCompletion: vi.fn(async () => providerResult())
    };
    const repository = createRepository(fixture, provider);

    await expect(
      repository.createMockCompletion(completionInput(fixture, "idem_app_budget"))
    ).rejects.toMatchObject({ code: "budget_exceeded", statusCode: 402 });
    expect(provider.createChatCompletion).not.toHaveBeenCalled();
    await repository.close();
  });

  it("forces the platform route when hosted platform-only mode is enabled", async () => {
    const fixture = await createFixture();
    await adminPool?.query(
      `
        update app_features
        set policy = '{"route_preference":["developer_key","platform_pool"]}'::jsonb
        where app_id = $1 and feature_key = 'customer_reply'
      `,
      [fixture.appId]
    );
    await adminPool?.query(
      `
        insert into provider_credentials(
          owner_scope, owner_id, provider, encrypted_secret_ref, models_allowed,
          budget_limit_usd, fallback_to_platform
        )
        values ('developer', $1, 'openai', 'must-not-be-used-in-platform-only-mode',
                array['gpt-budget-test'], '1.00000000', false)
      `,
      [fixture.developerId]
    );
    const createChatCompletion = vi.fn<CompletionProvider["createChatCompletion"]>(
      async (input) => {
        expect(input.providerCredential).toBeUndefined();
        expect(input.request.model).toBe(billingPolicy.platformModel);
        return providerResult();
      }
    );
    const repository = createRepository(
      fixture,
      { createChatCompletion },
      { platformOnly: true }
    );

    await expect(
      repository.createMockCompletion(completionInput(fixture, "idem_platform_only"))
    ).resolves.toMatchObject({ routeMode: "platform" });
    expect(createChatCompletion).toHaveBeenCalledOnce();
    await repository.close();
  });

  it("holds the reservation for review when provider usage exceeds the server cap", async () => {
    const fixture = await createFixture();
    const provider: CompletionProvider = {
      createChatCompletion: vi.fn(async () =>
        providerResult({ completionTokens: billingPolicy.maxOutputTokens + 1 })
      )
    };
    const repository = createRepository(fixture, provider);

    await expect(
      repository.createMockCompletion(completionInput(fixture, "idem_provider_overage"))
    ).rejects.toMatchObject({ code: "provider_error", statusCode: 502 });
    const state = await adminPool?.query<{
      status: string;
      reserved_balance_usd: string;
      usage_count: string;
    }>(
      `
        select
          gateway_completion_requests.status,
          wallets.reserved_balance_usd::text,
          (select count(*) from usage_events where request_id = gateway_completion_requests.request_id)::text as usage_count
        from gateway_completion_requests
        join wallets on wallets.id = gateway_completion_requests.wallet_id
        where gateway_completion_requests.developer_id = $1
      `,
      [fixture.developerId]
    );
    expect(state?.rows[0]).toEqual({
      status: "requires_review",
      reserved_balance_usd: reservedRetailPrice,
      usage_count: "0"
    });
    await repository.close();
  });
});
