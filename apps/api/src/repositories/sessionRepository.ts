import { ModelFaucetError, type JsonObject, type RouteMode } from "@modelfaucet/shared";
import pg from "pg";

const { Pool } = pg;

export type CreateVirtualSessionInput = {
  publicAppId: string;
  externalUserHash: string;
  tokenHash: string;
  scopes: string[];
  featureKey?: string;
  metadata: JsonObject;
  expiresAt: Date;
};

export type CreateVirtualSessionResult = {
  sessionId: string;
  endUserId: string;
  walletBalanceUsd: string;
  availableModes: RouteMode[];
};

export type SessionRepository = {
  createVirtualSession(input: CreateVirtualSessionInput): Promise<CreateVirtualSessionResult>;
  close?(): Promise<void>;
};

type AppRow = {
  id: string;
};

type IdRow = {
  id: string;
};

type WalletRow = {
  balance_usd: string;
};

export class PostgresSessionRepository implements SessionRepository {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async createVirtualSession(
    input: CreateVirtualSessionInput
  ): Promise<CreateVirtualSessionResult> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const appResult = await client.query<AppRow>(
        "select id from apps where public_app_id = $1 and status = 'active'",
        [input.publicAppId]
      );
      const app = appResult.rows[0];
      if (app === undefined) {
        throw new ModelFaucetError({
          code: "invalid_app",
          message: "The public app id is invalid or inactive.",
          statusCode: 404
        });
      }

      if (input.featureKey !== undefined) {
        const featureResult = await client.query<IdRow>(
          "select id from app_features where app_id = $1 and feature_key = $2",
          [app.id, input.featureKey]
        );

        if (featureResult.rows[0] === undefined) {
          throw new ModelFaucetError({
            code: "feature_not_found",
            message: "The requested feature key was not found for this app.",
            statusCode: 404
          });
        }
      }

      const endUserResult = await client.query<IdRow>(
        `
          insert into end_users (app_id, external_user_hash, metadata)
          values ($1, $2, $3::jsonb)
          on conflict (app_id, external_user_hash) do update
          set
            metadata = end_users.metadata || excluded.metadata,
            updated_at = now()
          returning id
        `,
        [app.id, input.externalUserHash, JSON.stringify(input.metadata)]
      );
      const endUser = endUserResult.rows[0];
      if (endUser === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Unable to upsert end user.",
          statusCode: 500
        });
      }

      await client.query(
        `
          insert into wallets (owner_scope, owner_id, balance_usd)
          values ('end_user', $1, 0)
          on conflict (owner_scope, owner_id) do nothing
        `,
        [endUser.id]
      );

      const walletResult = await client.query<WalletRow>(
        `
          select balance_usd::text
          from wallets
          where owner_scope = 'end_user' and owner_id = $1
        `,
        [endUser.id]
      );
      const wallet = walletResult.rows[0];
      if (wallet === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Unable to load end user wallet.",
          statusCode: 500
        });
      }

      const sessionResult = await client.query<IdRow>(
        `
          insert into virtual_sessions (
            app_id,
            end_user_id,
            token_hash,
            scopes,
            feature_key,
            expires_at
          )
          values ($1, $2, $3, $4, $5, $6)
          returning id
        `,
        [app.id, endUser.id, input.tokenHash, input.scopes, input.featureKey ?? null, input.expiresAt]
      );
      const session = sessionResult.rows[0];
      if (session === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Unable to create virtual session.",
          statusCode: 500
        });
      }

      await client.query("commit");

      return {
        sessionId: session.id,
        endUserId: endUser.id,
        walletBalanceUsd: wallet.balance_usd,
        availableModes: ["platform", "byok", "local"]
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
}

