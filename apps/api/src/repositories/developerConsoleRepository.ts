import { ModelFaucetError } from "@modelfaucet/shared";
import pg from "pg";

const { Pool } = pg;

export type DeveloperAppSummary = {
  public_app_id: string;
  name: string;
  vertical?: string;
  default_revenue_share_bps: number;
  status: string;
  developer_id: string;
  developer_name: string;
  developer_email: string;
  created_at: string;
  updated_at: string;
};

export type CreateDeveloperAppInput = {
  publicAppId: string;
  name: string;
  vertical?: string;
  defaultRevenueShareBps: number;
  status: "active" | "disabled";
  now: Date;
};

export type UpdateDeveloperAppInput = {
  publicAppId: string;
  name?: string;
  vertical?: string;
  defaultRevenueShareBps?: number;
  status?: "active" | "disabled";
  now: Date;
};

export type DeveloperFeatureSummary = {
  id: string;
  public_app_id: string;
  feature_key: string;
  display_name: string;
  policy: Record<string, unknown>;
  pricing: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CreateDeveloperFeatureInput = {
  publicAppId: string;
  featureKey: string;
  displayName: string;
  policy: Record<string, unknown>;
  pricing: Record<string, unknown>;
  now: Date;
};

export type UpdateDeveloperFeatureInput = {
  publicAppId: string;
  featureKey: string;
  displayName?: string;
  policy?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  now: Date;
};

export type DeveloperWalletSummary = {
  id: string;
  owner_scope: string;
  owner_id: string;
  owner_name?: string;
  balance_usd: string;
  updated_at: string;
};

export type DeveloperTopupSummary = {
  id: string;
  wallet_id: string;
  owner_scope: string;
  owner_id: string;
  provider: string;
  provider_checkout_session_id: string;
  amount_usd: string;
  status: string;
  checkout_url?: string;
  created_at: string;
  updated_at: string;
};

export type DeveloperPayoutSummary = {
  id: string;
  developer_id: string;
  developer_name: string;
  amount_usd: string;
  status: string;
  provider?: string;
  provider_payout_id?: string;
  created_at: string;
  updated_at: string;
};

export type DeveloperAuditLogSummary = {
  id: string;
  actor_scope: string;
  actor_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DeveloperOperationsSummary = {
  wallets: DeveloperWalletSummary[];
  topups: DeveloperTopupSummary[];
  payouts: DeveloperPayoutSummary[];
  audit_logs: DeveloperAuditLogSummary[];
};

export type DeveloperConsoleRepository = {
  listApps(): Promise<DeveloperAppSummary[]>;
  createApp(input: CreateDeveloperAppInput): Promise<DeveloperAppSummary>;
  updateApp(input: UpdateDeveloperAppInput): Promise<DeveloperAppSummary>;
  archiveApp(publicAppId: string, now: Date): Promise<DeveloperAppSummary>;
  listFeatures(publicAppId: string): Promise<DeveloperFeatureSummary[]>;
  createFeature(input: CreateDeveloperFeatureInput): Promise<DeveloperFeatureSummary>;
  updateFeature(input: UpdateDeveloperFeatureInput): Promise<DeveloperFeatureSummary>;
  deleteFeature(publicAppId: string, featureKey: string): Promise<void>;
  getOperations(): Promise<DeveloperOperationsSummary>;
  close?(): Promise<void>;
};

type DeveloperRow = {
  id: string;
  name: string;
  email: string;
};

type AppRow = {
  public_app_id: string;
  name: string;
  vertical: string | null;
  default_revenue_share_bps: number;
  status: string;
  developer_id: string;
  developer_name: string;
  developer_email: string;
  created_at: Date;
  updated_at: Date;
};

type AppContextRow = {
  app_id: string;
  developer_id: string;
};

type FeatureRow = {
  id: string;
  public_app_id: string;
  feature_key: string;
  display_name: string;
  policy: Record<string, unknown> | null;
  pricing: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type WalletRow = {
  id: string;
  owner_scope: string;
  owner_id: string;
  owner_name: string | null;
  balance_usd: string;
  updated_at: Date;
};

type TopupRow = {
  id: string;
  wallet_id: string;
  owner_scope: string;
  owner_id: string;
  provider: string;
  provider_checkout_session_id: string;
  amount_usd: string;
  status: string;
  checkout_url: string | null;
  created_at: Date;
  updated_at: Date;
};

type PayoutRow = {
  id: string;
  developer_id: string;
  developer_name: string;
  amount_usd: string;
  status: string;
  provider: string | null;
  provider_payout_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type AuditLogRow = {
  id: string;
  actor_scope: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

function toRecord(value: Record<string, unknown> | null): Record<string, unknown> {
  return value ?? {};
}

function toAppSummary(row: AppRow): DeveloperAppSummary {
  return {
    public_app_id: row.public_app_id,
    name: row.name,
    vertical: row.vertical ?? undefined,
    default_revenue_share_bps: row.default_revenue_share_bps,
    status: row.status,
    developer_id: row.developer_id,
    developer_name: row.developer_name,
    developer_email: row.developer_email,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

function toFeatureSummary(row: FeatureRow): DeveloperFeatureSummary {
  return {
    id: row.id,
    public_app_id: row.public_app_id,
    feature_key: row.feature_key,
    display_name: row.display_name,
    policy: toRecord(row.policy),
    pricing: toRecord(row.pricing),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

function toWalletSummary(row: WalletRow): DeveloperWalletSummary {
  return {
    id: row.id,
    owner_scope: row.owner_scope,
    owner_id: row.owner_id,
    owner_name: row.owner_name ?? undefined,
    balance_usd: row.balance_usd,
    updated_at: row.updated_at.toISOString()
  };
}

function toTopupSummary(row: TopupRow): DeveloperTopupSummary {
  return {
    id: row.id,
    wallet_id: row.wallet_id,
    owner_scope: row.owner_scope,
    owner_id: row.owner_id,
    provider: row.provider,
    provider_checkout_session_id: row.provider_checkout_session_id,
    amount_usd: row.amount_usd,
    status: row.status,
    checkout_url: row.checkout_url ?? undefined,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

function toPayoutSummary(row: PayoutRow): DeveloperPayoutSummary {
  return {
    id: row.id,
    developer_id: row.developer_id,
    developer_name: row.developer_name,
    amount_usd: row.amount_usd,
    status: row.status,
    provider: row.provider ?? undefined,
    provider_payout_id: row.provider_payout_id ?? undefined,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

function toAuditLogSummary(row: AuditLogRow): DeveloperAuditLogSummary {
  return {
    id: row.id,
    actor_scope: row.actor_scope,
    actor_id: row.actor_id ?? undefined,
    action: row.action,
    resource_type: row.resource_type,
    resource_id: row.resource_id ?? undefined,
    metadata: toRecord(row.metadata),
    created_at: row.created_at.toISOString()
  };
}

async function getDefaultDeveloper(client: pg.PoolClient): Promise<DeveloperRow> {
  const result = await client.query<DeveloperRow>(
    `
      select id, name, email
      from developers
      where status = 'active'
      order by created_at asc
      limit 1
    `
  );
  const developer = result.rows[0];
  if (developer === undefined) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: "No active developer is configured.",
      statusCode: 500
    });
  }

  return developer;
}

async function getAppContext(
  client: pg.PoolClient,
  publicAppId: string
): Promise<AppContextRow> {
  const result = await client.query<AppContextRow>(
    `
      select apps.id as app_id, apps.developer_id
      from apps
      join developers on developers.id = apps.developer_id
      where apps.public_app_id = $1 and developers.status = 'active'
    `,
    [publicAppId]
  );
  const app = result.rows[0];
  if (app === undefined) {
    throw new ModelFaucetError({
      code: "invalid_app",
      message: "The public app id is invalid.",
      statusCode: 404
    });
  }

  return app;
}

export class PostgresDeveloperConsoleRepository implements DeveloperConsoleRepository {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async listApps(): Promise<DeveloperAppSummary[]> {
    const result = await this.pool.query<AppRow>(
      `
        select
          apps.public_app_id,
          apps.name,
          apps.vertical,
          apps.default_revenue_share_bps,
          apps.status,
          developers.id as developer_id,
          developers.name as developer_name,
          developers.email as developer_email,
          apps.created_at,
          apps.updated_at
        from apps
        join developers on developers.id = apps.developer_id
        order by apps.created_at desc
      `
    );

    return result.rows.map(toAppSummary);
  }

  async createApp(input: CreateDeveloperAppInput): Promise<DeveloperAppSummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const developer = await getDefaultDeveloper(client);
      await client.query(
        `
          insert into wallets (owner_scope, owner_id, balance_usd, created_at, updated_at)
          values ('developer', $1, 0, $2, $2)
          on conflict (owner_scope, owner_id) do nothing
        `,
        [developer.id, input.now]
      );
      const inserted = await client.query<AppRow>(
        `
          insert into apps (
            developer_id,
            public_app_id,
            name,
            vertical,
            default_revenue_share_bps,
            status,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $7)
          returning
            public_app_id,
            name,
            vertical,
            default_revenue_share_bps,
            status,
            developer_id,
            $8::text as developer_name,
            $9::text as developer_email,
            created_at,
            updated_at
        `,
        [
          developer.id,
          input.publicAppId,
          input.name,
          input.vertical ?? null,
          input.defaultRevenueShareBps,
          input.status,
          input.now,
          developer.name,
          developer.email
        ]
      );
      const app = inserted.rows[0];
      if (app === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "App could not be created.",
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
          values ('developer', $1, 'app.create', 'app', null, $2::jsonb)
        `,
        [
          developer.id,
          JSON.stringify({
            public_app_id: app.public_app_id,
            name: app.name,
            vertical: app.vertical,
            status: app.status
          })
        ]
      );

      await client.query("commit");
      return toAppSummary(app);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateApp(input: UpdateDeveloperAppInput): Promise<DeveloperAppSummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const updated = await client.query<AppRow>(
        `
          with updated_app as (
            update apps
            set
              name = coalesce($2, name),
              vertical = case when $3 then $4 else vertical end,
              default_revenue_share_bps = coalesce($5, default_revenue_share_bps),
              status = coalesce($6, status),
              updated_at = $7
            where public_app_id = $1
            returning *
          )
          select
            updated_app.public_app_id,
            updated_app.name,
            updated_app.vertical,
            updated_app.default_revenue_share_bps,
            updated_app.status,
            developers.id as developer_id,
            developers.name as developer_name,
            developers.email as developer_email,
            updated_app.created_at,
            updated_app.updated_at
          from updated_app
          join developers on developers.id = updated_app.developer_id
        `,
        [
          input.publicAppId,
          input.name ?? null,
          input.vertical !== undefined,
          input.vertical ?? null,
          input.defaultRevenueShareBps ?? null,
          input.status ?? null,
          input.now
        ]
      );
      const app = updated.rows[0];
      if (app === undefined) {
        throw new ModelFaucetError({
          code: "invalid_app",
          message: "The app could not be found.",
          statusCode: 404
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
          values ('developer', $1, 'app.update', 'app', null, $2::jsonb)
        `,
        [
          app.developer_id,
          JSON.stringify({
            public_app_id: app.public_app_id,
            name: app.name,
            vertical: app.vertical,
            default_revenue_share_bps: app.default_revenue_share_bps,
            status: app.status
          })
        ]
      );

      await client.query("commit");
      return toAppSummary(app);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async archiveApp(publicAppId: string, now: Date): Promise<DeveloperAppSummary> {
    return this.updateApp({
      publicAppId,
      status: "disabled",
      now
    });
  }

  async listFeatures(publicAppId: string): Promise<DeveloperFeatureSummary[]> {
    const result = await this.pool.query<FeatureRow>(
      `
        select
          app_features.id,
          apps.public_app_id,
          app_features.feature_key,
          app_features.display_name,
          app_features.policy,
          app_features.pricing,
          app_features.created_at,
          app_features.updated_at
        from app_features
        join apps on apps.id = app_features.app_id
        join developers on developers.id = apps.developer_id
        where apps.public_app_id = $1 and developers.status = 'active'
        order by app_features.created_at desc
      `,
      [publicAppId]
    );

    return result.rows.map(toFeatureSummary);
  }

  async createFeature(
    input: CreateDeveloperFeatureInput
  ): Promise<DeveloperFeatureSummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const app = await getAppContext(client, input.publicAppId);
      const inserted = await client.query<FeatureRow>(
        `
          insert into app_features (
            app_id,
            feature_key,
            display_name,
            policy,
            pricing,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6)
          returning
            id,
            $7::text as public_app_id,
            feature_key,
            display_name,
            policy,
            pricing,
            created_at,
            updated_at
        `,
        [
          app.app_id,
          input.featureKey,
          input.displayName,
          JSON.stringify(input.policy),
          JSON.stringify(input.pricing),
          input.now,
          input.publicAppId
        ]
      );
      const feature = inserted.rows[0];
      if (feature === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Feature could not be created.",
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
          values ('developer', $1, 'feature.create', 'app_feature', $2, $3::jsonb)
        `,
        [
          app.developer_id,
          feature.id,
          JSON.stringify({
            public_app_id: input.publicAppId,
            feature_key: feature.feature_key
          })
        ]
      );

      await client.query("commit");
      return toFeatureSummary(feature);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateFeature(
    input: UpdateDeveloperFeatureInput
  ): Promise<DeveloperFeatureSummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const app = await getAppContext(client, input.publicAppId);
      const updated = await client.query<FeatureRow>(
        `
          update app_features
          set
            display_name = coalesce($3, display_name),
            policy = case when $4 then $5::jsonb else policy end,
            pricing = case when $6 then $7::jsonb else pricing end,
            updated_at = $8
          where app_id = $1 and feature_key = $2
          returning
            id,
            $9::text as public_app_id,
            feature_key,
            display_name,
            policy,
            pricing,
            created_at,
            updated_at
        `,
        [
          app.app_id,
          input.featureKey,
          input.displayName ?? null,
          input.policy !== undefined,
          JSON.stringify(input.policy ?? {}),
          input.pricing !== undefined,
          JSON.stringify(input.pricing ?? {}),
          input.now,
          input.publicAppId
        ]
      );
      const feature = updated.rows[0];
      if (feature === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Feature could not be found.",
          statusCode: 404
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
          values ('developer', $1, 'feature.update', 'app_feature', $2, $3::jsonb)
        `,
        [
          app.developer_id,
          feature.id,
          JSON.stringify({
            public_app_id: input.publicAppId,
            feature_key: feature.feature_key
          })
        ]
      );

      await client.query("commit");
      return toFeatureSummary(feature);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteFeature(publicAppId: string, featureKey: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const app = await getAppContext(client, publicAppId);
      const deleted = await client.query<{ id: string }>(
        `
          delete from app_features
          where app_id = $1 and feature_key = $2
          returning id
        `,
        [app.app_id, featureKey]
      );
      const feature = deleted.rows[0];
      if (feature === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Feature could not be found.",
          statusCode: 404
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
          values ('developer', $1, 'feature.delete', 'app_feature', $2, $3::jsonb)
        `,
        [
          app.developer_id,
          feature.id,
          JSON.stringify({
            public_app_id: publicAppId,
            feature_key: featureKey
          })
        ]
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getOperations(): Promise<DeveloperOperationsSummary> {
    const [wallets, topups, payouts, auditLogs] = await Promise.all([
      this.pool.query<WalletRow>(
        `
          select
            wallets.id,
            wallets.owner_scope,
            wallets.owner_id,
            developers.name as owner_name,
            wallets.balance_usd::text,
            wallets.updated_at
          from wallets
          left join developers on wallets.owner_scope = 'developer'
            and developers.id = wallets.owner_id
          order by wallets.owner_scope asc, wallets.updated_at desc
          limit 100
        `
      ),
      this.pool.query<TopupRow>(
        `
          select
            wallet_topups.id,
            wallet_topups.wallet_id,
            wallets.owner_scope,
            wallets.owner_id,
            wallet_topups.provider,
            wallet_topups.provider_checkout_session_id,
            wallet_topups.amount_usd::text,
            wallet_topups.status,
            wallet_topups.checkout_url,
            wallet_topups.created_at,
            wallet_topups.updated_at
          from wallet_topups
          join wallets on wallets.id = wallet_topups.wallet_id
          order by wallet_topups.created_at desc
          limit 50
        `
      ),
      this.pool.query<PayoutRow>(
        `
          select
            payouts.id,
            payouts.developer_id,
            developers.name as developer_name,
            payouts.amount_usd::text,
            payouts.status,
            payouts.provider,
            payouts.provider_payout_id,
            payouts.created_at,
            payouts.updated_at
          from payouts
          join developers on developers.id = payouts.developer_id
          order by payouts.created_at desc
          limit 50
        `
      ),
      this.pool.query<AuditLogRow>(
        `
          select
            id,
            actor_scope,
            actor_id,
            action,
            resource_type,
            resource_id,
            metadata,
            created_at
          from audit_logs
          order by created_at desc
          limit 50
        `
      )
    ]);

    return {
      wallets: wallets.rows.map(toWalletSummary),
      topups: topups.rows.map(toTopupSummary),
      payouts: payouts.rows.map(toPayoutSummary),
      audit_logs: auditLogs.rows.map(toAuditLogSummary)
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
