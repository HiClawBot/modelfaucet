import { ModelFaucetError, parseMoneyToUnits } from "@modelfaucet/shared";
import pg from "pg";

const { Pool } = pg;

export type PayoutSummary = {
  id: string;
  developer_id: string;
  amount_usd: string;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  provider?: string;
  provider_payout_id?: string;
};

export type PayoutRepository = {
  createPendingPayouts(input: {
    thresholdUsd: string;
    now: Date;
  }): Promise<PayoutSummary[]>;
  approvePayout(input: {
    payoutId: string;
    operatorNote?: string;
    now: Date;
  }): Promise<PayoutSummary>;
  markPayoutPaid(input: {
    payoutId: string;
    now: Date;
  }): Promise<PayoutSummary>;
  close?(): Promise<void>;
};

type DeveloperWalletRow = {
  wallet_id: string;
  developer_id: string;
  balance_usd: string;
};

type PayoutRow = {
  id: string;
  developer_id: string;
  amount_usd: string;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  provider: string | null;
  provider_payout_id: string | null;
};

function toPayoutSummary(row: PayoutRow): PayoutSummary {
  return {
    id: row.id,
    developer_id: row.developer_id,
    amount_usd: row.amount_usd,
    status: row.status,
    provider: row.provider ?? undefined,
    provider_payout_id: row.provider_payout_id ?? undefined
  };
}

export class PostgresPayoutRepository implements PayoutRepository {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async createPendingPayouts(input: {
    thresholdUsd: string;
    now: Date;
  }): Promise<PayoutSummary[]> {
    if (parseMoneyToUnits(input.thresholdUsd) <= 0n) {
      throw new ModelFaucetError({
        code: "invalid_request",
        message: "Payout threshold must be greater than zero.",
        statusCode: 400
      });
    }

    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const candidates = await client.query<DeveloperWalletRow>(
        `
          select
            wallets.id as wallet_id,
            wallets.owner_id as developer_id,
            wallets.balance_usd::text
          from wallets
          join developers on developers.id = wallets.owner_id
          where
            wallets.owner_scope = 'developer'
            and wallets.balance_usd >= $1::numeric
            and developers.status = 'active'
            and not exists (
              select 1
              from payouts
              where
                payouts.developer_id = wallets.owner_id
                and payouts.status in ('pending', 'processing')
            )
          order by wallets.created_at asc
          for update of wallets
        `,
        [input.thresholdUsd]
      );

      const payouts: PayoutSummary[] = [];
      for (const wallet of candidates.rows) {
        const inserted = await client.query<PayoutRow>(
          `
            insert into payouts (
              developer_id,
              amount_usd,
              status,
              provider,
              metadata,
              created_at,
              updated_at
            )
            values ($1, $2::numeric, 'pending', 'mock', $3::jsonb, $4, $4)
            returning
              id,
              developer_id,
              amount_usd::text,
              status,
              provider,
              provider_payout_id
          `,
          [
            wallet.developer_id,
            wallet.balance_usd,
            JSON.stringify({
              wallet_id: wallet.wallet_id,
              threshold_usd: input.thresholdUsd
            }),
            input.now
          ]
        );
        const payout = inserted.rows[0];
        if (payout === undefined) {
          throw new ModelFaucetError({
            code: "invalid_request",
            message: "Pending payout could not be created.",
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
            values ('admin', null, 'payout.create_pending', 'payout', $1, $2::jsonb)
          `,
          [
            payout.id,
            JSON.stringify({
              developer_id: payout.developer_id,
              amount_usd: payout.amount_usd,
              threshold_usd: input.thresholdUsd
            })
          ]
        );

        payouts.push(toPayoutSummary(payout));
      }

      await client.query("commit");
      return payouts;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async approvePayout(input: {
    payoutId: string;
    operatorNote?: string;
    now: Date;
  }): Promise<PayoutSummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const payoutResult = await client.query<PayoutRow>(
        `
          select
            id,
            developer_id,
            amount_usd::text,
            status,
            provider,
            provider_payout_id
          from payouts
          where id = $1
          for update
        `,
        [input.payoutId]
      );
      const payout = payoutResult.rows[0];
      if (payout === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Payout was not found.",
          statusCode: 404
        });
      }

      if (payout.status === "processing") {
        await client.query("commit");
        return toPayoutSummary(payout);
      }

      if (payout.status !== "pending") {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Only pending payouts can be approved.",
          statusCode: 400
        });
      }

      const updated = await client.query<PayoutRow>(
        `
          update payouts
          set status = 'processing',
              metadata = metadata || jsonb_strip_nulls($2::jsonb),
              updated_at = $3
          where id = $1
          returning
            id,
            developer_id,
            amount_usd::text,
            status,
            provider,
            provider_payout_id
        `,
        [
          payout.id,
          JSON.stringify({
            approved_at: input.now.toISOString(),
            operator_note: input.operatorNote ?? null
          }),
          input.now
        ]
      );
      const approved = updated.rows[0];
      if (approved === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Payout could not be approved.",
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
          values ('admin', null, 'payout.approve', 'payout', $1, $2::jsonb)
        `,
        [
          approved.id,
          JSON.stringify({
            developer_id: approved.developer_id,
            amount_usd: approved.amount_usd,
            operator_note: input.operatorNote ?? null
          })
        ]
      );

      await client.query("commit");
      return toPayoutSummary(approved);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async markPayoutPaid(input: { payoutId: string; now: Date }): Promise<PayoutSummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const payoutResult = await client.query<PayoutRow>(
        `
          select
            id,
            developer_id,
            amount_usd::text,
            status,
            provider,
            provider_payout_id
          from payouts
          where id = $1
          for update
        `,
        [input.payoutId]
      );
      const payout = payoutResult.rows[0];
      if (payout === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Payout was not found.",
          statusCode: 404
        });
      }

      if (payout.status === "paid") {
        await client.query("commit");
        return toPayoutSummary(payout);
      }

      if (payout.status !== "processing") {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Payout must be approved before it can be marked paid.",
          statusCode: 400
        });
      }

      const walletResult = await client.query<{ id: string; balance_usd: string }>(
        `
          select id, balance_usd::text
          from wallets
          where owner_scope = 'developer' and owner_id = $1
          for update
        `,
        [payout.developer_id]
      );
      const wallet = walletResult.rows[0];
      if (wallet === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Developer wallet was not found.",
          statusCode: 404
        });
      }

      if (parseMoneyToUnits(wallet.balance_usd) < parseMoneyToUnits(payout.amount_usd)) {
        throw new ModelFaucetError({
          code: "insufficient_balance",
          message: "Developer wallet does not have enough balance for payout.",
          statusCode: 402
        });
      }

      await client.query(
        `
          update wallets
          set balance_usd = balance_usd - $2::numeric,
              updated_at = $3
          where id = $1
        `,
        [wallet.id, payout.amount_usd, input.now]
      );
      await client.query(
        `
          insert into ledger_entries (wallet_id, direction, amount_usd, reason, metadata)
          values ($1, 'debit', $2::numeric, 'mock_payout_paid', $3::jsonb)
        `,
        [
          wallet.id,
          payout.amount_usd,
          JSON.stringify({
            payout_id: payout.id,
            developer_id: payout.developer_id
          })
        ]
      );
      const updated = await client.query<PayoutRow>(
        `
          update payouts
          set status = 'paid',
              provider = coalesce(provider, 'mock'),
              provider_payout_id = coalesce(provider_payout_id, $2),
              updated_at = $3
          where id = $1
          returning
            id,
            developer_id,
            amount_usd::text,
            status,
            provider,
            provider_payout_id
        `,
        [payout.id, `po_mock_${payout.id.replace(/-/g, "").slice(0, 18)}`, input.now]
      );
      const paid = updated.rows[0];
      if (paid === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Payout could not be marked paid.",
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
          values ('admin', null, 'payout.mark_paid', 'payout', $1, $2::jsonb)
        `,
        [
          paid.id,
          JSON.stringify({
            developer_id: paid.developer_id,
            amount_usd: paid.amount_usd,
            provider_payout_id: paid.provider_payout_id
          })
        ]
      );

      await client.query("commit");
      return toPayoutSummary(paid);
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
