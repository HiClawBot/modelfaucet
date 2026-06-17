import { ModelFaucetError } from "@modelfaucet/shared";
import pg from "pg";

const { Pool } = pg;

export type WalletSummary = {
  id: string;
  owner_scope: string;
  owner_id: string;
  balance_usd: string;
};

export type WalletRepository = {
  getUserWallet(sessionTokenHash: string, now: Date): Promise<WalletSummary>;
  creditTestBalance(input: {
    walletId: string;
    amountUsd: string;
    now: Date;
  }): Promise<WalletSummary>;
  close?(): Promise<void>;
};

type SessionWalletRow = WalletSummary & {
  expires_at: Date;
};

async function getWalletForSession(
  client: pg.PoolClient,
  sessionTokenHash: string,
  now: Date
): Promise<WalletSummary> {
  const result = await client.query<SessionWalletRow>(
    `
      select
        wallets.id,
        wallets.owner_scope,
        wallets.owner_id,
        wallets.balance_usd::text,
        virtual_sessions.expires_at
      from virtual_sessions
      join apps on apps.id = virtual_sessions.app_id
      join developers on developers.id = apps.developer_id
      join wallets on wallets.owner_scope = 'end_user'
        and wallets.owner_id = virtual_sessions.end_user_id
      where
        virtual_sessions.token_hash = $1
        and virtual_sessions.revoked_at is null
        and apps.status = 'active'
        and developers.status = 'active'
    `,
    [sessionTokenHash]
  );
  const wallet = result.rows[0];
  if (wallet === undefined) {
    throw new ModelFaucetError({
      code: "invalid_session",
      message: "The session token is invalid.",
      statusCode: 401
    });
  }

  if (wallet.expires_at.getTime() <= now.getTime()) {
    throw new ModelFaucetError({
      code: "expired_session",
      message: "The session token is expired.",
      statusCode: 401
    });
  }

  return {
    id: wallet.id,
    owner_scope: wallet.owner_scope,
    owner_id: wallet.owner_id,
    balance_usd: wallet.balance_usd
  };
}

export class PostgresWalletRepository implements WalletRepository {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async getUserWallet(sessionTokenHash: string, now: Date): Promise<WalletSummary> {
    const client = await this.pool.connect();

    try {
      return await getWalletForSession(client, sessionTokenHash, now);
    } finally {
      client.release();
    }
  }

  async creditTestBalance(input: {
    walletId: string;
    amountUsd: string;
    now: Date;
  }): Promise<WalletSummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const walletResult = await client.query<WalletSummary>(
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

      const updated = await client.query<WalletSummary>(
        `
          update wallets
          set balance_usd = balance_usd + $2::numeric,
              updated_at = $3
          where id = $1
          returning id, owner_scope, owner_id, balance_usd::text
        `,
        [input.walletId, input.amountUsd, input.now]
      );
      const credited = updated.rows[0];
      if (credited === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Wallet could not be credited.",
          statusCode: 500
        });
      }

      await client.query(
        `
          insert into ledger_entries (wallet_id, direction, amount_usd, reason, metadata)
          values ($1, 'credit', $2::numeric, 'admin_test_balance_credit', $3::jsonb)
        `,
        [
          input.walletId,
          input.amountUsd,
          JSON.stringify({
            owner_scope: wallet.owner_scope,
            owner_id: wallet.owner_id
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
          values ('admin', null, 'wallet.credit_test_balance', 'wallet', $1, $2::jsonb)
        `,
        [
          input.walletId,
          JSON.stringify({
            amount_usd: input.amountUsd,
            owner_scope: wallet.owner_scope,
            owner_id: wallet.owner_id
          })
        ]
      );

      await client.query("commit");
      return credited;
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
