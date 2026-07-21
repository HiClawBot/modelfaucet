import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresDeveloperConsoleRepository } from "../src/index";

const databaseUrl = process.env.DATABASE_URL;
const { Pool } = pg;
const adminPool = databaseUrl === undefined ? undefined : new Pool({ connectionString: databaseUrl });
const createdDeveloperIds: string[] = [];

afterAll(async () => {
  if (adminPool === undefined) {
    return;
  }
  for (const developerId of createdDeveloperIds) {
    await adminPool.query("delete from audit_logs where actor_id = $1", [developerId]);
    await adminPool.query("delete from apps where developer_id = $1", [developerId]);
    await adminPool.query(
      "delete from wallets where owner_scope = 'developer' and owner_id = $1",
      [developerId]
    );
    await adminPool.query("delete from developers where id = $1", [developerId]);
  }
  await adminPool.end();
});

describe.skipIf(databaseUrl === undefined)("PostgresDeveloperConsoleRepository", () => {
  it("persists and updates hosted Beta app policies", async () => {
    if (adminPool === undefined || databaseUrl === undefined) {
      throw new Error("DATABASE_URL is required.");
    }
    const suffix = randomUUID().replaceAll("-", "");
    const developer = await adminPool.query<{ id: string }>(
      "insert into developers(name, email) values ($1, $2) returning id",
      [`Console ${suffix}`, `console-${suffix}@example.invalid`]
    );
    const developerId = developer.rows[0]?.id;
    if (developerId === undefined) {
      throw new Error("Unable to create developer console test fixture.");
    }
    createdDeveloperIds.push(developerId);

    const repository = new PostgresDeveloperConsoleRepository({ connectionString: databaseUrl });
    const publicAppId = `app_console_${suffix}`;
    const created = await repository.createApp({
      developerId,
      publicAppId,
      name: "Pilot Console",
      defaultRevenueShareBps: 4000,
      allowedOrigins: ["https://pilot.example.com"],
      monthlySpendLimitUsd: "25.00",
      sessionSpendLimitUsd: "2.00",
      status: "active",
      now: new Date("2026-07-21T00:00:00.000Z")
    });
    expect(created).toMatchObject({
      public_app_id: publicAppId,
      allowed_origins: ["https://pilot.example.com"],
      monthly_spend_limit_usd: "25.00000000",
      session_spend_limit_usd: "2.00000000"
    });

    const updated = await repository.updateApp({
      developerId,
      publicAppId,
      allowedOrigins: ["https://pilot.example.com", "https://admin.example.com"],
      monthlySpendLimitUsd: "30.00",
      sessionSpendLimitUsd: "3.00",
      now: new Date("2026-07-21T00:01:00.000Z")
    });
    expect(updated).toMatchObject({
      allowed_origins: ["https://pilot.example.com", "https://admin.example.com"],
      monthly_spend_limit_usd: "30.00000000",
      session_spend_limit_usd: "3.00000000"
    });

    const listed = await repository.listApps(developerId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ public_app_id: publicAppId, status: "active" });
    await repository.close();
  });
});
