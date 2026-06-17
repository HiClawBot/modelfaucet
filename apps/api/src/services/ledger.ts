import {
  parseMoneyToUnits,
  type JsonObject,
  type RatedUsage
} from "@modelfaucet/shared";
import pg from "pg";
import { loadApiEnv } from "../env";

const { Pool } = pg;

const PLATFORM_WALLET_OWNER_ID = "00000000-0000-0000-0000-000000000001";
const PROVIDER_COST_WALLET_OWNER_ID = "00000000-0000-0000-0000-000000000002";

export type RatedUsageLedgerInput = RatedUsage & {
  app_id: string;
  developer_id: string;
  end_user_id: string;
  feature_key?: string;
  provider?: string;
  model: string;
  metadata?: JsonObject;
};

export type LedgerEntryDraft = {
  ownerScope: "end_user" | "provider_cost" | "developer" | "platform";
  ownerId: string;
  direction: "debit" | "credit";
  amountUsd: string;
  reason: string;
};

type IdRow = {
  id: string;
};

type WalletRow = {
  id: string;
  balance_usd: string;
};

function assertMoneyString(value: string): void {
  parseMoneyToUnits(value);
}

function assertRatedUsageAmounts(ratedUsage: RatedUsage): void {
  for (const amount of [
    ratedUsage.upstream_cost_usd,
    ratedUsage.retail_price_usd,
    ratedUsage.gross_margin_usd,
    ratedUsage.channel_revenue_usd,
    ratedUsage.platform_revenue_usd
  ]) {
    assertMoneyString(amount);
  }
}

export function buildLedgerEntryDrafts(ratedUsage: RatedUsageLedgerInput): LedgerEntryDraft[] {
  assertRatedUsageAmounts(ratedUsage);

  return [
    {
      ownerScope: "end_user",
      ownerId: ratedUsage.end_user_id,
      direction: "debit",
      amountUsd: ratedUsage.retail_price_usd,
      reason: "usage_retail_price"
    },
    {
      ownerScope: "provider_cost",
      ownerId: PROVIDER_COST_WALLET_OWNER_ID,
      direction: "credit",
      amountUsd: ratedUsage.upstream_cost_usd,
      reason: "usage_provider_cost"
    },
    {
      ownerScope: "developer",
      ownerId: ratedUsage.developer_id,
      direction: "credit",
      amountUsd: ratedUsage.channel_revenue_usd,
      reason: "usage_channel_revenue"
    },
    {
      ownerScope: "platform",
      ownerId: PLATFORM_WALLET_OWNER_ID,
      direction: "credit",
      amountUsd: ratedUsage.platform_revenue_usd,
      reason: "usage_platform_revenue"
    }
  ];
}

async function ensureWallet(
  client: pg.PoolClient,
  ownerScope: LedgerEntryDraft["ownerScope"],
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
    throw new Error(`Unable to load ${ownerScope} wallet`);
  }

  return wallet;
}

async function updateWalletBalance(
  client: pg.PoolClient,
  walletId: string,
  direction: LedgerEntryDraft["direction"],
  amountUsd: string
): Promise<void> {
  const operator = direction === "debit" ? "-" : "+";
  await client.query(
    `
      update wallets
      set balance_usd = balance_usd ${operator} $2::numeric,
          updated_at = now()
      where id = $1
    `,
    [walletId, amountUsd]
  );
}

export class PostgresLedgerService {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async recordRatedUsage(ratedUsage: RatedUsageLedgerInput): Promise<void> {
    assertRatedUsageAmounts(ratedUsage);

    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const existing = await client.query<IdRow>(
        "select id from usage_events where request_id = $1 for update",
        [ratedUsage.request_id]
      );
      if (existing.rows[0] !== undefined) {
        await client.query("commit");
        return;
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
          ratedUsage.request_id,
          ratedUsage.app_id,
          ratedUsage.developer_id,
          ratedUsage.end_user_id,
          ratedUsage.feature_key ?? null,
          ratedUsage.route_mode,
          ratedUsage.provider ?? null,
          ratedUsage.model,
          ratedUsage.input_tokens,
          ratedUsage.output_tokens,
          ratedUsage.cached_tokens,
          ratedUsage.upstream_cost_usd,
          ratedUsage.retail_price_usd,
          ratedUsage.gross_margin_usd,
          ratedUsage.channel_revenue_usd,
          ratedUsage.platform_revenue_usd,
          JSON.stringify(ratedUsage.metadata ?? {})
        ]
      );
      const usageEvent = usageResult.rows[0];
      if (usageEvent === undefined) {
        throw new Error("Unable to insert usage event");
      }

      const drafts = buildLedgerEntryDrafts(ratedUsage);
      const wallets = new Map<string, WalletRow>();
      for (const draft of drafts) {
        const key = `${draft.ownerScope}:${draft.ownerId}`;
        if (!wallets.has(key)) {
          wallets.set(key, await ensureWallet(client, draft.ownerScope, draft.ownerId));
        }
      }

      const endUserWallet = wallets.get(`end_user:${ratedUsage.end_user_id}`);
      if (endUserWallet === undefined) {
        throw new Error("Unable to load end user wallet");
      }

      if (
        parseMoneyToUnits(endUserWallet.balance_usd) <
        parseMoneyToUnits(ratedUsage.retail_price_usd)
      ) {
        throw new Error("Insufficient end user wallet balance");
      }

      for (const draft of drafts) {
        const wallet = wallets.get(`${draft.ownerScope}:${draft.ownerId}`);
        if (wallet === undefined) {
          throw new Error(`Unable to load ${draft.ownerScope} wallet`);
        }

        await client.query(
          `
            insert into ledger_entries (wallet_id, usage_event_id, direction, amount_usd, reason)
            values ($1, $2, $3, $4::numeric, $5)
          `,
          [wallet.id, usageEvent.id, draft.direction, draft.amountUsd, draft.reason]
        );
        await updateWalletBalance(client, wallet.id, draft.direction, draft.amountUsd);
      }

      await client.query("commit");
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
}

export async function recordRatedUsage(ratedUsage: RatedUsageLedgerInput): Promise<void> {
  const env = loadApiEnv();
  const service = new PostgresLedgerService({
    connectionString: env.databaseUrl
  });

  try {
    await service.recordRatedUsage(ratedUsage);
  } finally {
    await service.close();
  }
}
