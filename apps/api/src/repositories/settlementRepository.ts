import { ModelFaucetError, parseMoneyToUnits } from "@modelfaucet/shared";
import pg from "pg";

const { Pool } = pg;

export type LedgerReconciliationItem = {
  wallet_id: string;
  owner_scope: string;
  owner_id: string;
  wallet_balance_usd: string;
  ledger_balance_usd: string;
  delta_usd: string;
  status: "balanced" | "mismatch";
};

export type LedgerReconciliationReport = {
  generated_at: string;
  summary: {
    wallet_count: number;
    balanced_count: number;
    mismatch_count: number;
  };
  items: LedgerReconciliationItem[];
};

export type WalletAdjustmentSummary = {
  id: string;
  wallet_id: string;
  kind: "adjustment" | "refund" | "chargeback";
  direction: "credit" | "debit";
  amount_usd: string;
  status: "applied";
  reason?: string;
  idempotency_key?: string;
  wallet_balance_usd: string;
};

export type SettlementRepository = {
  getLedgerReconciliation(now: Date): Promise<LedgerReconciliationReport>;
  createWalletAdjustment(input: {
    walletId: string;
    kind: "adjustment" | "refund" | "chargeback";
    direction: "credit" | "debit";
    amountUsd: string;
    reason?: string;
    idempotencyKey?: string;
    now: Date;
  }): Promise<WalletAdjustmentSummary>;
  exportUsageCsv(): Promise<string>;
  exportRevenueCsv(): Promise<string>;
  exportPayoutsCsv(): Promise<string>;
  close?(): Promise<void>;
};

type LedgerReconciliationRow = {
  wallet_id: string;
  owner_scope: string;
  owner_id: string;
  wallet_balance_usd: string;
  ledger_balance_usd: string;
  delta_usd: string;
  balanced: boolean;
};

type WalletAdjustmentRow = {
  id: string;
  wallet_id: string;
  kind: "adjustment" | "refund" | "chargeback";
  direction: "credit" | "debit";
  amount_usd: string;
  status: "applied";
  reason: string | null;
  idempotency_key: string | null;
  wallet_balance_usd: string;
};

function toLedgerItem(row: LedgerReconciliationRow): LedgerReconciliationItem {
  return {
    wallet_id: row.wallet_id,
    owner_scope: row.owner_scope,
    owner_id: row.owner_id,
    wallet_balance_usd: row.wallet_balance_usd,
    ledger_balance_usd: row.ledger_balance_usd,
    delta_usd: row.delta_usd,
    status: row.balanced ? "balanced" : "mismatch"
  };
}

function toWalletAdjustmentSummary(row: WalletAdjustmentRow): WalletAdjustmentSummary {
  return {
    id: row.id,
    wallet_id: row.wallet_id,
    kind: row.kind,
    direction: row.direction,
    amount_usd: row.amount_usd,
    status: row.status,
    reason: row.reason ?? undefined,
    idempotency_key: row.idempotency_key ?? undefined,
    wallet_balance_usd: row.wallet_balance_usd
  };
}

function csvCell(value: string | number | Date | null | undefined): string {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

function csvRows(rows: Array<Array<string | number | Date | null | undefined>>): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function assertPositiveMoney(value: string, message: string): void {
  if (parseMoneyToUnits(value) <= 0n) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message,
      statusCode: 400
    });
  }
}

function ledgerReasonForAdjustment(kind: WalletAdjustmentSummary["kind"]): string {
  if (kind === "refund") {
    return "wallet_refund";
  }

  if (kind === "chargeback") {
    return "wallet_chargeback";
  }

  return "wallet_adjustment";
}

export class PostgresSettlementRepository implements SettlementRepository {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async getLedgerReconciliation(now: Date): Promise<LedgerReconciliationReport> {
    const result = await this.pool.query<LedgerReconciliationRow>(
      `
        with ledger_balances as (
          select
            wallet_id,
            coalesce(
              sum(
                case
                  when direction = 'credit' then amount_usd
                  else -amount_usd
                end
              ),
              0::numeric(18,8)
            )::numeric(18,8) as ledger_balance_usd
          from ledger_entries
          group by wallet_id
        )
        select
          wallets.id as wallet_id,
          wallets.owner_scope,
          wallets.owner_id,
          wallets.balance_usd::numeric(18,8)::text as wallet_balance_usd,
          coalesce(ledger_balances.ledger_balance_usd, 0::numeric(18,8))::numeric(18,8)::text
            as ledger_balance_usd,
          (
            wallets.balance_usd -
            coalesce(ledger_balances.ledger_balance_usd, 0::numeric(18,8))
          )::numeric(18,8)::text as delta_usd,
          wallets.balance_usd =
            coalesce(ledger_balances.ledger_balance_usd, 0::numeric(18,8)) as balanced
        from wallets
        left join ledger_balances on ledger_balances.wallet_id = wallets.id
        order by wallets.owner_scope asc, wallets.created_at asc
      `
    );

    const items = result.rows.map(toLedgerItem);
    const balancedCount = items.filter((item) => item.status === "balanced").length;
    return {
      generated_at: now.toISOString(),
      summary: {
        wallet_count: items.length,
        balanced_count: balancedCount,
        mismatch_count: items.length - balancedCount
      },
      items
    };
  }

  async createWalletAdjustment(input: {
    walletId: string;
    kind: "adjustment" | "refund" | "chargeback";
    direction: "credit" | "debit";
    amountUsd: string;
    reason?: string;
    idempotencyKey?: string;
    now: Date;
  }): Promise<WalletAdjustmentSummary> {
    assertPositiveMoney(input.amountUsd, "Wallet adjustment amount must be greater than zero.");

    const client = await this.pool.connect();

    try {
      await client.query("begin");

      if (input.idempotencyKey !== undefined) {
        const existing = await client.query<WalletAdjustmentRow>(
          `
            select
              wallet_adjustments.id,
              wallet_adjustments.wallet_id,
              wallet_adjustments.kind,
              wallet_adjustments.direction,
              wallet_adjustments.amount_usd::text,
              wallet_adjustments.status,
              wallet_adjustments.reason,
              wallet_adjustments.idempotency_key,
              wallets.balance_usd::text as wallet_balance_usd
            from wallet_adjustments
            join wallets on wallets.id = wallet_adjustments.wallet_id
            where wallet_adjustments.idempotency_key = $1
            for update of wallet_adjustments
          `,
          [input.idempotencyKey]
        );
        const existingAdjustment = existing.rows[0];
        if (existingAdjustment !== undefined) {
          await client.query("commit");
          return toWalletAdjustmentSummary(existingAdjustment);
        }
      }

      const walletResult = await client.query<{
        id: string;
        owner_scope: string;
        owner_id: string;
        balance_usd: string;
      }>(
        `
          select id, owner_scope, owner_id, balance_usd::text
          from wallets
          where id = $1
          for update
        `,
        [input.walletId]
      );
      const wallet = walletResult.rows[0];
      if (wallet === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Wallet was not found.",
          statusCode: 404
        });
      }

      if (
        input.direction === "debit" &&
        parseMoneyToUnits(wallet.balance_usd) < parseMoneyToUnits(input.amountUsd)
      ) {
        throw new ModelFaucetError({
          code: "insufficient_balance",
          message: "Wallet does not have enough balance for the adjustment.",
          statusCode: 402
        });
      }

      const inserted = await client.query<WalletAdjustmentRow>(
        `
          insert into wallet_adjustments (
            wallet_id,
            kind,
            direction,
            amount_usd,
            status,
            reason,
            idempotency_key,
            metadata,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4::numeric, 'applied', $5, $6, $7::jsonb, $8, $8)
          returning
            id,
            wallet_id,
            kind,
            direction,
            amount_usd::text,
            status,
            reason,
            idempotency_key,
            $9::text as wallet_balance_usd
        `,
        [
          wallet.id,
          input.kind,
          input.direction,
          input.amountUsd,
          input.reason ?? null,
          input.idempotencyKey ?? null,
          JSON.stringify({
            owner_scope: wallet.owner_scope,
            owner_id: wallet.owner_id
          }),
          input.now,
          wallet.balance_usd
        ]
      );
      const adjustment = inserted.rows[0];
      if (adjustment === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Wallet adjustment could not be recorded.",
          statusCode: 500
        });
      }

      await client.query(
        `
          insert into ledger_entries (wallet_id, direction, amount_usd, reason, metadata)
          values ($1, $2, $3::numeric, $4, $5::jsonb)
        `,
        [
          wallet.id,
          input.direction,
          input.amountUsd,
          ledgerReasonForAdjustment(input.kind),
          JSON.stringify({
            adjustment_id: adjustment.id,
            kind: input.kind,
            reason: input.reason ?? null,
            idempotency_key: input.idempotencyKey ?? null
          })
        ]
      );

      const operator = input.direction === "debit" ? "-" : "+";
      const updated = await client.query<WalletAdjustmentRow>(
        `
          update wallets
          set balance_usd = balance_usd ${operator} $2::numeric,
              updated_at = $3
          where id = $1
          returning $4::uuid as id,
            wallets.id as wallet_id,
            $5::text as kind,
            $6::text as direction,
            $2::numeric(18,8)::text as amount_usd,
            'applied'::text as status,
            $7::text as reason,
            $8::text as idempotency_key,
            wallets.balance_usd::text as wallet_balance_usd
        `,
        [
          wallet.id,
          input.amountUsd,
          input.now,
          adjustment.id,
          input.kind,
          input.direction,
          input.reason ?? null,
          input.idempotencyKey ?? null
        ]
      );
      const applied = updated.rows[0];
      if (applied === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Wallet adjustment could not update the wallet balance.",
          statusCode: 500
        });
      }

      await client.query(
        `
          insert into audit_logs (
            actor_scope,
            actor_id,
            action,
            resource_type,
            resource_id,
            metadata
          )
          values ('admin', null, 'wallet.adjustment_applied', 'wallet_adjustment', $1, $2::jsonb)
        `,
        [
          adjustment.id,
          JSON.stringify({
            wallet_id: wallet.id,
            owner_scope: wallet.owner_scope,
            owner_id: wallet.owner_id,
            kind: input.kind,
            direction: input.direction,
            amount_usd: input.amountUsd,
            reason: input.reason ?? null
          })
        ]
      );

      await client.query("commit");
      return toWalletAdjustmentSummary(applied);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async exportUsageCsv(): Promise<string> {
    const result = await this.pool.query<{
      created_at: Date;
      request_id: string;
      public_app_id: string;
      feature_key: string | null;
      route_mode: string;
      provider: string | null;
      model: string | null;
      input_tokens: number;
      output_tokens: number;
      upstream_cost_usd: string;
      retail_price_usd: string;
      channel_revenue_usd: string;
      platform_revenue_usd: string;
    }>(
      `
        select
          usage_events.created_at,
          usage_events.request_id,
          apps.public_app_id,
          usage_events.feature_key,
          usage_events.route_mode,
          usage_events.provider,
          usage_events.model,
          usage_events.input_tokens,
          usage_events.output_tokens,
          usage_events.upstream_cost_usd::text,
          usage_events.retail_price_usd::text,
          usage_events.channel_revenue_usd::text,
          usage_events.platform_revenue_usd::text
        from usage_events
        join apps on apps.id = usage_events.app_id
        order by usage_events.created_at desc
        limit 10000
      `
    );

    return csvRows([
      [
        "created_at",
        "request_id",
        "public_app_id",
        "feature_key",
        "route_mode",
        "provider",
        "model",
        "input_tokens",
        "output_tokens",
        "upstream_cost_usd",
        "retail_price_usd",
        "channel_revenue_usd",
        "platform_revenue_usd"
      ],
      ...result.rows.map((row) => [
        row.created_at,
        row.request_id,
        row.public_app_id,
        row.feature_key,
        row.route_mode,
        row.provider,
        row.model,
        row.input_tokens,
        row.output_tokens,
        row.upstream_cost_usd,
        row.retail_price_usd,
        row.channel_revenue_usd,
        row.platform_revenue_usd
      ])
    ]);
  }

  async exportRevenueCsv(): Promise<string> {
    const result = await this.pool.query<{
      public_app_id: string;
      developer_id: string;
      developer_email: string;
      total_calls: string;
      upstream_cost_usd: string;
      retail_price_usd: string;
      channel_revenue_usd: string;
      platform_revenue_usd: string;
    }>(
      `
        select
          apps.public_app_id,
          developers.id as developer_id,
          developers.email as developer_email,
          count(usage_events.id)::text as total_calls,
          coalesce(sum(usage_events.upstream_cost_usd), 0)::numeric(18,8)::text
            as upstream_cost_usd,
          coalesce(sum(usage_events.retail_price_usd), 0)::numeric(18,8)::text
            as retail_price_usd,
          coalesce(sum(usage_events.channel_revenue_usd), 0)::numeric(18,8)::text
            as channel_revenue_usd,
          coalesce(sum(usage_events.platform_revenue_usd), 0)::numeric(18,8)::text
            as platform_revenue_usd
        from apps
        join developers on developers.id = apps.developer_id
        left join usage_events on usage_events.app_id = apps.id
        group by apps.public_app_id, developers.id, developers.email
        order by apps.public_app_id asc
      `
    );

    return csvRows([
      [
        "public_app_id",
        "developer_id",
        "developer_email",
        "total_calls",
        "upstream_cost_usd",
        "retail_price_usd",
        "channel_revenue_usd",
        "platform_revenue_usd"
      ],
      ...result.rows.map((row) => [
        row.public_app_id,
        row.developer_id,
        row.developer_email,
        row.total_calls,
        row.upstream_cost_usd,
        row.retail_price_usd,
        row.channel_revenue_usd,
        row.platform_revenue_usd
      ])
    ]);
  }

  async exportPayoutsCsv(): Promise<string> {
    const result = await this.pool.query<{
      created_at: Date;
      updated_at: Date;
      payout_id: string;
      developer_id: string;
      developer_email: string;
      amount_usd: string;
      status: string;
      provider: string | null;
      provider_payout_id: string | null;
    }>(
      `
        select
          payouts.created_at,
          payouts.updated_at,
          payouts.id as payout_id,
          payouts.developer_id,
          developers.email as developer_email,
          payouts.amount_usd::text,
          payouts.status,
          payouts.provider,
          payouts.provider_payout_id
        from payouts
        join developers on developers.id = payouts.developer_id
        order by payouts.created_at desc
        limit 10000
      `
    );

    return csvRows([
      [
        "created_at",
        "updated_at",
        "payout_id",
        "developer_id",
        "developer_email",
        "amount_usd",
        "status",
        "provider",
        "provider_payout_id"
      ],
      ...result.rows.map((row) => [
        row.created_at,
        row.updated_at,
        row.payout_id,
        row.developer_id,
        row.developer_email,
        row.amount_usd,
        row.status,
        row.provider,
        row.provider_payout_id
      ])
    ]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
