import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import {
  PostgresSessionRepository,
  PostgresSettlementRepository,
  PostgresWalletRepository
} from "../src/index";

const databaseUrl = process.env.DATABASE_URL;
const { Pool } = pg;
const adminPool = databaseUrl === undefined ? undefined : new Pool({ connectionString: databaseUrl });
const createdDeveloperIds: string[] = [];

async function createReservedWalletFixture(): Promise<{
  developerId: string;
  appId: string;
  publicAppId: string;
  externalUserHash: string;
  sessionTokenHash: string;
  walletId: string;
}> {
  if (adminPool === undefined) {
    throw new Error("DATABASE_URL is required for PostgreSQL repository tests.");
  }

  const suffix = randomUUID().replaceAll("-", "");
  const developer = await adminPool.query<{ id: string }>(
    "insert into developers(name, email) values ($1, $2) returning id",
    [`API Reservation Test ${suffix}`, `api-reservation-${suffix}@example.invalid`]
  );
  const developerId = developer.rows[0]?.id;
  if (developerId === undefined) {
    throw new Error("Unable to create test developer.");
  }
  createdDeveloperIds.push(developerId);

  const publicAppId = `app_api_reservation_${suffix}`;
  const app = await adminPool.query<{ id: string }>(
    `
      insert into apps(developer_id, public_app_id, name)
      values ($1, $2, $3)
      returning id
    `,
    [developerId, publicAppId, `API Reservation App ${suffix}`]
  );
  const appId = app.rows[0]?.id;
  if (appId === undefined) {
    throw new Error("Unable to create test app.");
  }

  const externalUserHash = `sha256:${suffix}`;
  const endUser = await adminPool.query<{ id: string }>(
    `
      insert into end_users(app_id, external_user_hash)
      values ($1, $2)
      returning id
    `,
    [appId, externalUserHash]
  );
  const endUserId = endUser.rows[0]?.id;
  if (endUserId === undefined) {
    throw new Error("Unable to create test end user.");
  }

  const sessionTokenHash = `session_hash_${suffix}`;
  await adminPool.query(
    `
      insert into virtual_sessions(app_id, end_user_id, token_hash, expires_at)
      values ($1, $2, $3, now() + interval '1 hour')
    `,
    [appId, endUserId, sessionTokenHash]
  );
  const wallet = await adminPool.query<{ id: string }>(
    `
      insert into wallets(owner_scope, owner_id, balance_usd, reserved_balance_usd)
      values ('end_user', $1, 1, 0.75)
      returning id
    `,
    [endUserId]
  );
  const walletId = wallet.rows[0]?.id;
  if (walletId === undefined) {
    throw new Error("Unable to create test wallet.");
  }

  return {
    developerId,
    appId,
    publicAppId,
    externalUserHash,
    sessionTokenHash,
    walletId
  };
}

afterAll(async () => {
  if (adminPool === undefined) {
    return;
  }

  for (const developerId of createdDeveloperIds) {
    const queries = [
      `delete from ledger_entries where wallet_id in (
        select id from wallets where owner_id in (
          select id from end_users where app_id in (select id from apps where developer_id = $1)
        )
      )`,
      `delete from wallet_adjustments where wallet_id in (
        select id from wallets where owner_id in (
          select id from end_users where app_id in (select id from apps where developer_id = $1)
        )
      )`,
      `delete from wallets where owner_id in (
        select id from end_users where app_id in (select id from apps where developer_id = $1)
      )`,
      "delete from virtual_sessions where app_id in (select id from apps where developer_id = $1)",
      "delete from end_users where app_id in (select id from apps where developer_id = $1)",
      "delete from apps where developer_id = $1",
      "delete from developers where id = $1"
    ];
    for (const query of queries) {
      await adminPool.query(query, [developerId]);
    }
  }

  await adminPool.end();
});

describe.skipIf(databaseUrl === undefined)("PostgreSQL wallet reservations", () => {
  it("returns spendable balance from wallet and session reads", async () => {
    const fixture = await createReservedWalletFixture();
    const walletRepository = new PostgresWalletRepository({ connectionString: databaseUrl });
    const sessionRepository = new PostgresSessionRepository({ connectionString: databaseUrl });

    await expect(
      walletRepository.getUserWallet(fixture.sessionTokenHash, new Date())
    ).resolves.toMatchObject({ balance_usd: "0.25000000" });
    await expect(
      sessionRepository.createVirtualSession({
        publicAppId: fixture.publicAppId,
        externalUserHash: fixture.externalUserHash,
        tokenHash: `new_${fixture.sessionTokenHash}`,
        scopes: [],
        metadata: {},
        expiresAt: new Date(Date.now() + 60_000)
      })
    ).resolves.toMatchObject({ walletBalanceUsd: "0.25000000" });

    await walletRepository.close();
    await sessionRepository.close();
  });

  it("rejects an admin debit that would consume reserved funds", async () => {
    const fixture = await createReservedWalletFixture();
    const repository = new PostgresSettlementRepository({ connectionString: databaseUrl });

    await expect(
      repository.createWalletAdjustment({
        walletId: fixture.walletId,
        kind: "adjustment",
        direction: "debit",
        amountUsd: "0.30000000",
        now: new Date()
      })
    ).rejects.toMatchObject({ code: "insufficient_balance", statusCode: 402 });
    const state = await adminPool?.query<{
      balance_usd: string;
      reserved_balance_usd: string;
      adjustment_count: string;
    }>(
      `
        select balance_usd::text, reserved_balance_usd::text,
          (select count(*) from wallet_adjustments where wallet_id = wallets.id)::text
            as adjustment_count
        from wallets where id = $1
      `,
      [fixture.walletId]
    );
    expect(state?.rows[0]).toEqual({
      balance_usd: "1.00000000",
      reserved_balance_usd: "0.75000000",
      adjustment_count: "0"
    });

    await repository.close();
  });

  it("enforces the app origin allowlist when session origin policy is enabled", async () => {
    const fixture = await createReservedWalletFixture();
    await adminPool?.query(
      "update apps set allowed_origins = array['https://pilot.example'] where id = $1",
      [fixture.appId]
    );
    const repository = new PostgresSessionRepository({ connectionString: databaseUrl });

    await expect(
      repository.createVirtualSession({
        publicAppId: fixture.publicAppId,
        externalUserHash: fixture.externalUserHash,
        tokenHash: `allowed_${fixture.sessionTokenHash}`,
        scopes: ["chat"],
        metadata: {},
        expiresAt: new Date(Date.now() + 60_000),
        origin: "https://pilot.example",
        enforceAllowedOrigin: true
      })
    ).resolves.toMatchObject({ endUserId: expect.any(String) });
    await expect(
      repository.createVirtualSession({
        publicAppId: fixture.publicAppId,
        externalUserHash: fixture.externalUserHash,
        tokenHash: `blocked_${fixture.sessionTokenHash}`,
        scopes: ["chat"],
        metadata: {},
        expiresAt: new Date(Date.now() + 60_000),
        origin: "https://evil.example",
        enforceAllowedOrigin: true
      })
    ).rejects.toMatchObject({ code: "invalid_app", statusCode: 404 });

    await repository.close();
  });
});
