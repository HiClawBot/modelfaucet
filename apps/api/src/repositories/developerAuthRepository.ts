import { ModelFaucetError } from "@modelfaucet/shared";
import pg from "pg";

const { Pool } = pg;

export const developerScopes = [
  "developer:apps:read",
  "developer:apps:write",
  "developer:features:read",
  "developer:features:write",
  "developer:operations:read",
  "developer:provider_keys:read",
  "developer:provider_keys:write",
  "developer:tokens:read",
  "developer:tokens:write"
] as const;

export type DeveloperScope = (typeof developerScopes)[number];

export type DeveloperAuthContext = {
  authMethod: "developer_admin" | "developer_token";
  developerId?: string;
  developerName?: string;
  developerEmail?: string;
  tokenId?: string;
  scopes: DeveloperScope[];
};

export type DeveloperTokenSummary = {
  id: string;
  developer_id: string;
  developer_name: string;
  developer_email: string;
  name: string;
  token_prefix: string;
  scopes: DeveloperScope[];
  status: string;
  last_used_at?: string;
  expires_at?: string;
  revoked_at?: string;
  created_at: string;
  updated_at: string;
};

export type CreateDeveloperTokenInput = {
  developerId?: string;
  developerEmail?: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  scopes: DeveloperScope[];
  expiresAt?: Date;
  now: Date;
};

export type DeveloperAuthRepository = {
  authenticateToken(tokenHash: string, now: Date): Promise<DeveloperAuthContext | undefined>;
  createToken(input: CreateDeveloperTokenInput): Promise<DeveloperTokenSummary>;
  listTokens(developerId?: string): Promise<DeveloperTokenSummary[]>;
  revokeToken(tokenId: string, now: Date, developerId?: string): Promise<void>;
  close?(): Promise<void>;
};

type DeveloperRow = {
  id: string;
  name: string;
  email: string;
};

type DeveloperTokenRow = {
  id: string;
  developer_id: string;
  developer_name: string;
  developer_email: string;
  name: string;
  token_prefix: string;
  scopes: DeveloperScope[] | null;
  status: string;
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function toTokenSummary(row: DeveloperTokenRow): DeveloperTokenSummary {
  return {
    id: row.id,
    developer_id: row.developer_id,
    developer_name: row.developer_name,
    developer_email: row.developer_email,
    name: row.name,
    token_prefix: row.token_prefix,
    scopes: row.scopes ?? [],
    status: row.status,
    last_used_at: row.last_used_at?.toISOString(),
    expires_at: row.expires_at?.toISOString(),
    revoked_at: row.revoked_at?.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

async function resolveDeveloper(
  client: pg.PoolClient,
  developerId: string | undefined,
  developerEmail: string | undefined
): Promise<DeveloperRow> {
  const result =
    developerId !== undefined || developerEmail !== undefined
      ? await client.query<DeveloperRow>(
          `
            select id, name, email
            from developers
            where
              status = 'active'
              and ($1::uuid is null or id = $1)
              and ($2::text is null or email = $2)
            limit 1
          `,
          [developerId ?? null, developerEmail ?? null]
        )
      : await client.query<DeveloperRow>(
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
      message: "No matching active developer is configured.",
      statusCode: 404
    });
  }

  return developer;
}

export class PostgresDeveloperAuthRepository implements DeveloperAuthRepository {
  private readonly pool: pg.Pool;

  constructor(config: pg.PoolConfig) {
    this.pool = new Pool(config);
  }

  async authenticateToken(
    tokenHash: string,
    now: Date
  ): Promise<DeveloperAuthContext | undefined> {
    const result = await this.pool.query<DeveloperTokenRow>(
      `
        select
          developer_api_tokens.id,
          developers.id as developer_id,
          developers.name as developer_name,
          developers.email as developer_email,
          developer_api_tokens.name,
          developer_api_tokens.token_prefix,
          developer_api_tokens.scopes,
          developer_api_tokens.status,
          developer_api_tokens.last_used_at,
          developer_api_tokens.expires_at,
          developer_api_tokens.revoked_at,
          developer_api_tokens.created_at,
          developer_api_tokens.updated_at
        from developer_api_tokens
        join developers on developers.id = developer_api_tokens.developer_id
        where
          developer_api_tokens.token_hash = $1
          and developer_api_tokens.status = 'active'
          and developers.status = 'active'
          and (
            developer_api_tokens.expires_at is null
            or developer_api_tokens.expires_at > $2
          )
        limit 1
      `,
      [tokenHash, now]
    );
    const token = result.rows[0];
    if (token === undefined) {
      return undefined;
    }

    await this.pool.query(
      `
        update developer_api_tokens
        set last_used_at = $2, updated_at = $2
        where id = $1
      `,
      [token.id, now]
    );

    return {
      authMethod: "developer_token",
      developerId: token.developer_id,
      developerName: token.developer_name,
      developerEmail: token.developer_email,
      tokenId: token.id,
      scopes: token.scopes ?? []
    };
  }

  async createToken(input: CreateDeveloperTokenInput): Promise<DeveloperTokenSummary> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const developer = await resolveDeveloper(
        client,
        input.developerId,
        input.developerEmail
      );
      const inserted = await client.query<DeveloperTokenRow>(
        `
          insert into developer_api_tokens (
            developer_id,
            name,
            token_hash,
            token_prefix,
            scopes,
            status,
            expires_at,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, 'active', $6, $7, $7)
          returning
            id,
            developer_id,
            $8::text as developer_name,
            $9::text as developer_email,
            name,
            token_prefix,
            scopes,
            status,
            last_used_at,
            expires_at,
            revoked_at,
            created_at,
            updated_at
        `,
        [
          developer.id,
          input.name,
          input.tokenHash,
          input.tokenPrefix,
          input.scopes,
          input.expiresAt ?? null,
          input.now,
          developer.name,
          developer.email
        ]
      );
      const token = inserted.rows[0];
      if (token === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Developer API token could not be created.",
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
          values ('developer', $1, 'developer_token.create', 'developer_api_token', $2, $3::jsonb)
        `,
        [
          developer.id,
          token.id,
          JSON.stringify({
            name: token.name,
            token_prefix: token.token_prefix,
            scopes: token.scopes ?? [],
            expires_at: token.expires_at?.toISOString()
          })
        ]
      );

      await client.query("commit");
      return toTokenSummary(token);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listTokens(developerId?: string): Promise<DeveloperTokenSummary[]> {
    const result = await this.pool.query<DeveloperTokenRow>(
      `
        select
          developer_api_tokens.id,
          developers.id as developer_id,
          developers.name as developer_name,
          developers.email as developer_email,
          developer_api_tokens.name,
          developer_api_tokens.token_prefix,
          developer_api_tokens.scopes,
          developer_api_tokens.status,
          developer_api_tokens.last_used_at,
          developer_api_tokens.expires_at,
          developer_api_tokens.revoked_at,
          developer_api_tokens.created_at,
          developer_api_tokens.updated_at
        from developer_api_tokens
        join developers on developers.id = developer_api_tokens.developer_id
        where $1::uuid is null or developer_api_tokens.developer_id = $1
        order by developer_api_tokens.created_at desc
        limit 100
      `,
      [developerId ?? null]
    );

    return result.rows.map(toTokenSummary);
  }

  async revokeToken(tokenId: string, now: Date, developerId?: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const updated = await client.query<{ id: string; developer_id: string }>(
        `
          update developer_api_tokens
          set
            status = 'revoked',
            revoked_at = $2,
            updated_at = $2
          where
            id = $1
            and status = 'active'
            and ($3::uuid is null or developer_id = $3)
          returning id, developer_id
        `,
        [tokenId, now, developerId ?? null]
      );
      const token = updated.rows[0];
      if (token === undefined) {
        throw new ModelFaucetError({
          code: "invalid_request",
          message: "Developer API token was not found.",
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
          values ('developer', $1, 'developer_token.revoke', 'developer_api_token', $2, $3::jsonb)
        `,
        [token.developer_id, token.id, JSON.stringify({ status: "revoked" })]
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
