import { ModelFaucetError } from "@modelfaucet/shared";
import pg from "pg";

const { Pool } = pg;

export type CheckoutTopupSummary = {
  id: string;
  wallet_id: string;
  provider: string;
  provider_checkout_session_id: string;
  provider_event_id?: string;
  amount_usd: string;
  status: "pending" | "credited" | "failed";
  checkout_url?: string;
  credited_wallet_balance_usd?: string;
};

export type PaymentRepository = {
  createPendingStripeCheckoutTopup(input: {
    walletId: string;
    checkoutSessionId: string;
    checkoutUrl: string;
    amountUsd: string;
    now: Date;
  }): Promise<CheckoutTopupSummary>;
  creditStripeCheckoutSession(input: {
    stripeEventId: string;
    checkoutSessionId: string;
    amountUsd: string;
    now: Date;
  }): Promise<CheckoutTopupSummary>;
  close?(): Promise<void>;
};

type WalletRow = {
  id: string;
  owner_scope: string;
  owner_id: string;
  balance_usd: string;
};

type TopupRow = {
  id: string;
  wallet_id: string;
  provider: string;
  provider_checkout_session_id: string;
  provider_event_id: string | null;
  amount_usd: string;
  status: "pending" | "credited" | "failed";
  checkout_url: string | null;
};

function toTopupSummary(
  row: TopupRow,
  creditedWalletBalanceUsd?: string
): CheckoutTopupSummary {
  return {
    id: row.id,
    wallet_id: row.wallet_id,
    provider: row.provider,
    provider_checkout_session_id: row.provider_checkout_session_id,
    provider_event_id: row.provider_event_id ?? undefined,
    amount_usd: row.amount_usd,
    status: row.status,
    checkout_url: row.checkout_url ?? undefined,
    credited_wallet_balance_usd: creditedWalletBalanceUsd
  };
}

export class PostgresPaymentRepository implements PaymentRepository {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async createPendingStripeCheckoutTopup(input: {
    walletId: string;
    checkoutSessionId: string;
    checkoutUrl: string;
    amountUsd: string;
    now: Date;
  }): Promise<CheckoutTopupSummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const walletResult = await client.query<WalletRow>(
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
          message: "Stripe top-up wallet was not found.",
          statusCode: 404
        });
      }
      const inserted = await client.query<TopupRow>(
        `
          insert into wallet_topups (
            wallet_id,
            provider,
            provider_checkout_session_id,
            amount_usd,
            status,
            checkout_url,
            metadata,
            created_at,
            updated_at
          )
          values ($1, 'stripe', $2, $3::numeric, 'pending', $4, $5::jsonb, $6, $6)
          returning
            id,
            wallet_id,
            provider,
            provider_checkout_session_id,
            provider_event_id,
            amount_usd::text,
            status,
            checkout_url
        `,
        [
          wallet.id,
          input.checkoutSessionId,
          input.amountUsd,
          input.checkoutUrl,
          JSON.stringify({
            owner_scope: wallet.owner_scope,
            owner_id: wallet.owner_id
          }),
          input.now
        ]
      );
      const topup = inserted.rows[0];
      if (topup === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Stripe checkout top-up could not be recorded.",
          statusCode: 500
        });
      }

      await client.query("commit");
      return toTopupSummary(topup);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async creditStripeCheckoutSession(input: {
    stripeEventId: string;
    checkoutSessionId: string;
    amountUsd: string;
    now: Date;
  }): Promise<CheckoutTopupSummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const eventResult = await client.query<TopupRow>(
        `
          select
            id,
            wallet_id,
            provider,
            provider_checkout_session_id,
            provider_event_id,
            amount_usd::text,
            status,
            checkout_url
          from wallet_topups
          where provider = 'stripe' and provider_event_id = $1
          for update
        `,
        [input.stripeEventId]
      );
      const existingEventTopup = eventResult.rows[0];
      if (existingEventTopup !== undefined) {
        await client.query("commit");
        return toTopupSummary(existingEventTopup);
      }

      const topupResult = await client.query<TopupRow>(
        `
          select
            id,
            wallet_id,
            provider,
            provider_checkout_session_id,
            provider_event_id,
            amount_usd::text,
            status,
            checkout_url
          from wallet_topups
          where provider = 'stripe' and provider_checkout_session_id = $1
          for update
        `,
        [input.checkoutSessionId]
      );
      const topup = topupResult.rows[0];
      if (topup === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Stripe checkout top-up was not found.",
          statusCode: 404
        });
      }

      if (topup.status === "credited") {
        await client.query("commit");
        return toTopupSummary(topup);
      }

      if (topup.amount_usd !== input.amountUsd) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Stripe checkout amount did not match the pending top-up.",
          statusCode: 400
        });
      }

      const walletResult = await client.query<WalletRow>(
        `
          update wallets
          set balance_usd = balance_usd + $2::numeric,
              updated_at = $3
          where id = $1
          returning id, owner_scope, owner_id, balance_usd::text
        `,
        [topup.wallet_id, topup.amount_usd, input.now]
      );
      const wallet = walletResult.rows[0];
      if (wallet === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Stripe top-up wallet was not found.",
          statusCode: 404
        });
      }

      await client.query(
        `
          insert into ledger_entries (wallet_id, direction, amount_usd, reason, metadata)
          values ($1, 'credit', $2::numeric, 'stripe_checkout_topup', $3::jsonb)
        `,
        [
          topup.wallet_id,
          topup.amount_usd,
          JSON.stringify({
            provider: "stripe",
            checkout_session_id: topup.provider_checkout_session_id,
            stripe_event_id: input.stripeEventId
          })
        ]
      );
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
          values ('stripe', null, 'wallet.stripe_topup_credited', 'wallet_topup', $1, $2::jsonb)
        `,
        [
          topup.id,
          JSON.stringify({
            wallet_id: topup.wallet_id,
            amount_usd: topup.amount_usd,
            checkout_session_id: topup.provider_checkout_session_id,
            stripe_event_id: input.stripeEventId
          })
        ]
      );
      const updatedTopup = await client.query<TopupRow>(
        `
          update wallet_topups
          set status = 'credited',
              provider_event_id = $2,
              updated_at = $3
          where id = $1
          returning
            id,
            wallet_id,
            provider,
            provider_checkout_session_id,
            provider_event_id,
            amount_usd::text,
            status,
            checkout_url
        `,
        [topup.id, input.stripeEventId, input.now]
      );
      const credited = updatedTopup.rows[0];
      if (credited === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Stripe top-up could not be credited.",
          statusCode: 500
        });
      }

      await client.query("commit");
      return toTopupSummary(credited, wallet.balance_usd);
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
