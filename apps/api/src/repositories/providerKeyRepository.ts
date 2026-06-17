import { ModelFaucetError } from "@modelfaucet/shared";
import pg from "pg";

const { Pool } = pg;

export type ProviderKeySummary = {
  id: string;
  provider: string;
  base_url?: string;
  masked: string;
  status: string;
  models_allowed: string[];
  priority: number;
  budget_limit_usd?: string;
  fallback_to_platform: boolean;
};

export type CreateUserProviderKeyInput = {
  sessionTokenHash: string;
  provider: string;
  baseUrl?: string;
  encryptedSecretRef: string;
  maskedSecret: string;
  modelsAllowed: string[];
  budgetLimitUsd?: string;
  priority: number;
  fallbackToPlatform: boolean;
  now: Date;
};

export type CreateDeveloperProviderKeyInput = {
  publicAppId: string;
  provider: string;
  baseUrl?: string;
  encryptedSecretRef: string;
  maskedSecret: string;
  modelsAllowed: string[];
  budgetLimitUsd?: string;
  priority: number;
  fallbackToPlatform: boolean;
  now: Date;
};

export type ProviderKeyRepository = {
  createUserProviderKey(input: CreateUserProviderKeyInput): Promise<ProviderKeySummary>;
  listUserProviderKeys(sessionTokenHash: string, now: Date): Promise<ProviderKeySummary[]>;
  disableUserProviderKey(
    sessionTokenHash: string,
    credentialId: string,
    now: Date
  ): Promise<void>;
  createDeveloperProviderKey(input: CreateDeveloperProviderKeyInput): Promise<ProviderKeySummary>;
  listDeveloperProviderKeys(publicAppId: string): Promise<ProviderKeySummary[]>;
  disableDeveloperProviderKey(credentialId: string): Promise<void>;
  close?(): Promise<void>;
};

type SessionContext = {
  app_id: string;
  end_user_id: string;
  expires_at: Date;
};

type DeveloperContext = {
  app_id: string;
  developer_id: string;
};

type ProviderKeyRow = {
  id: string;
  provider: string;
  base_url: string | null;
  masked_secret: string | null;
  status: string;
  models_allowed: string[] | null;
  priority: number;
  budget_limit_usd: string | null;
  fallback_to_platform: boolean;
};

async function getSessionContext(
  client: pg.PoolClient,
  sessionTokenHash: string,
  now: Date
): Promise<SessionContext> {
  const result = await client.query<SessionContext>(
    `
      select
        virtual_sessions.app_id,
        virtual_sessions.end_user_id,
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

  if (session.expires_at.getTime() <= now.getTime()) {
    throw new ModelFaucetError({
      code: "expired_session",
      message: "The session token is expired.",
      statusCode: 401
    });
  }

  return session;
}

async function getDeveloperContext(
  client: pg.PoolClient,
  publicAppId: string
): Promise<DeveloperContext> {
  const result = await client.query<DeveloperContext>(
    `
      select apps.id as app_id, apps.developer_id
      from apps
      join developers on developers.id = apps.developer_id
      where apps.public_app_id = $1 and apps.status = 'active' and developers.status = 'active'
    `,
    [publicAppId]
  );
  const developer = result.rows[0];
  if (developer === undefined) {
    throw new ModelFaucetError({
      code: "invalid_app",
      message: "The public app id is invalid or inactive.",
      statusCode: 404
    });
  }

  return developer;
}

function toProviderKeySummary(row: ProviderKeyRow): ProviderKeySummary {
  return {
    id: row.id,
    provider: row.provider,
    base_url: row.base_url ?? undefined,
    masked: row.masked_secret ?? "",
    status: row.status,
    models_allowed: row.models_allowed ?? [],
    priority: row.priority,
    budget_limit_usd: row.budget_limit_usd ?? undefined,
    fallback_to_platform: row.fallback_to_platform
  };
}

export class PostgresProviderKeyRepository implements ProviderKeyRepository {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async createUserProviderKey(
    input: CreateUserProviderKeyInput
  ): Promise<ProviderKeySummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const session = await getSessionContext(client, input.sessionTokenHash, input.now);

      const inserted = await client.query<ProviderKeyRow>(
        `
          insert into provider_credentials (
            owner_scope,
            owner_id,
            provider,
            base_url,
            encrypted_secret_ref,
            masked_secret,
            models_allowed,
            priority,
            budget_limit_usd,
            fallback_to_platform,
            status,
            last_validated_at
          )
          values (
            'end_user',
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8::numeric,
            $9,
            'active',
            $10
          )
          returning
            id,
            provider,
            base_url,
            masked_secret,
            status,
            models_allowed,
            priority,
            budget_limit_usd::text as budget_limit_usd,
            fallback_to_platform
        `,
        [
          session.end_user_id,
          input.provider,
          input.baseUrl ?? null,
          input.encryptedSecretRef,
          input.maskedSecret,
          input.modelsAllowed,
          input.priority,
          input.budgetLimitUsd ?? null,
          input.fallbackToPlatform,
          input.now
        ]
      );
      const credential = inserted.rows[0];
      if (credential === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Unable to store provider key.",
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
          values ('end_user', $1, 'provider_key.create', 'provider_credential', $2, $3::jsonb)
        `,
        [
          session.end_user_id,
          credential.id,
          JSON.stringify({
            app_id: session.app_id,
            provider: input.provider,
            base_url: input.baseUrl,
            models_allowed: input.modelsAllowed
          })
        ]
      );

      await client.query("commit");
      return toProviderKeySummary(credential);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listUserProviderKeys(
    sessionTokenHash: string,
    now: Date
  ): Promise<ProviderKeySummary[]> {
    const client = await this.pool.connect();

    try {
      const session = await getSessionContext(client, sessionTokenHash, now);
      const result = await client.query<ProviderKeyRow>(
        `
          select
            id,
            provider,
            base_url,
            masked_secret,
            status,
            models_allowed,
            priority,
            budget_limit_usd::text as budget_limit_usd,
            fallback_to_platform
          from provider_credentials
          where owner_scope = 'end_user' and owner_id = $1
          order by created_at desc
        `,
        [session.end_user_id]
      );

      return result.rows.map(toProviderKeySummary);
    } finally {
      client.release();
    }
  }

  async disableUserProviderKey(
    sessionTokenHash: string,
    credentialId: string,
    now: Date
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const session = await getSessionContext(client, sessionTokenHash, now);
      const updated = await client.query<{ id: string }>(
        `
          update provider_credentials
          set status = 'disabled', updated_at = now()
          where
            id = $1
            and owner_scope = 'end_user'
            and owner_id = $2
          returning id
        `,
        [credentialId, session.end_user_id]
      );
      const credential = updated.rows[0];
      if (credential === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Provider key was not found.",
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
          values ('end_user', $1, 'provider_key.disable', 'provider_credential', $2, $3::jsonb)
        `,
        [session.end_user_id, credential.id, JSON.stringify({ status: "disabled" })]
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createDeveloperProviderKey(
    input: CreateDeveloperProviderKeyInput
  ): Promise<ProviderKeySummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const developer = await getDeveloperContext(client, input.publicAppId);

      const inserted = await client.query<ProviderKeyRow>(
        `
          insert into provider_credentials (
            owner_scope,
            owner_id,
            provider,
            base_url,
            encrypted_secret_ref,
            masked_secret,
            models_allowed,
            priority,
            budget_limit_usd,
            fallback_to_platform,
            status,
            last_validated_at
          )
          values (
            'developer',
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8::numeric,
            $9,
            'active',
            $10
          )
          returning
            id,
            provider,
            base_url,
            masked_secret,
            status,
            models_allowed,
            priority,
            budget_limit_usd::text as budget_limit_usd,
            fallback_to_platform
        `,
        [
          developer.developer_id,
          input.provider,
          input.baseUrl ?? null,
          input.encryptedSecretRef,
          input.maskedSecret,
          input.modelsAllowed,
          input.priority,
          input.budgetLimitUsd ?? null,
          input.fallbackToPlatform,
          input.now
        ]
      );
      const credential = inserted.rows[0];
      if (credential === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Unable to store developer provider key.",
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
          values ('developer', $1, 'provider_key.create', 'provider_credential', $2, $3::jsonb)
        `,
        [
          developer.developer_id,
          credential.id,
          JSON.stringify({
            app_id: developer.app_id,
            provider: input.provider,
            base_url: input.baseUrl,
            models_allowed: input.modelsAllowed
          })
        ]
      );

      await client.query("commit");
      return toProviderKeySummary(credential);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listDeveloperProviderKeys(publicAppId: string): Promise<ProviderKeySummary[]> {
    const client = await this.pool.connect();

    try {
      const developer = await getDeveloperContext(client, publicAppId);
      const result = await client.query<ProviderKeyRow>(
        `
          select
            id,
            provider,
            base_url,
            masked_secret,
            status,
            models_allowed,
            priority,
            budget_limit_usd::text as budget_limit_usd,
            fallback_to_platform
          from provider_credentials
          where owner_scope = 'developer' and owner_id = $1
          order by created_at desc
        `,
        [developer.developer_id]
      );

      return result.rows.map(toProviderKeySummary);
    } finally {
      client.release();
    }
  }

  async disableDeveloperProviderKey(credentialId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const updated = await client.query<{ id: string; owner_id: string }>(
        `
          update provider_credentials
          set status = 'disabled', updated_at = now()
          where id = $1 and owner_scope = 'developer'
          returning id, owner_id
        `,
        [credentialId]
      );
      const credential = updated.rows[0];
      if (credential === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Developer provider key was not found.",
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
          values ('developer', $1, 'provider_key.disable', 'provider_credential', $2, $3::jsonb)
        `,
        [credential.owner_id, credential.id, JSON.stringify({ status: "disabled" })]
      );

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
