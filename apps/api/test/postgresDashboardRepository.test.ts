import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresDashboardRepository } from "../src/index";

const databaseUrl = process.env.DATABASE_URL;
const { Pool } = pg;
const adminPool = databaseUrl === undefined ? undefined : new Pool({ connectionString: databaseUrl });
const createdDeveloperIds: string[] = [];

async function createDeveloperAndApp(label: string): Promise<{
  developerId: string;
  appId: string;
  publicAppId: string;
}> {
  if (adminPool === undefined) {
    throw new Error("DATABASE_URL is required for PostgreSQL repository tests.");
  }
  const suffix = randomUUID().replaceAll("-", "");
  const developer = await adminPool.query<{ id: string }>(
    "insert into developers(name, email) values ($1, $2) returning id",
    [`Dashboard ${label} ${suffix}`, `dashboard-${label}-${suffix}@example.invalid`]
  );
  const developerId = developer.rows[0]?.id;
  if (developerId === undefined) {
    throw new Error("Unable to create dashboard test developer.");
  }
  createdDeveloperIds.push(developerId);
  const publicAppId = `app_dashboard_${label}_${suffix}`;
  const app = await adminPool.query<{ id: string }>(
    `
      insert into apps(developer_id, public_app_id, name)
      values ($1, $2, $3)
      returning id
    `,
    [developerId, publicAppId, `Dashboard ${label}`]
  );
  const appId = app.rows[0]?.id;
  if (appId === undefined) {
    throw new Error("Unable to create dashboard test app.");
  }
  return { developerId, appId, publicAppId };
}

afterAll(async () => {
  if (adminPool === undefined) {
    return;
  }
  for (const developerId of createdDeveloperIds) {
    await adminPool.query("delete from usage_events where developer_id = $1", [developerId]);
    await adminPool.query("delete from apps where developer_id = $1", [developerId]);
    await adminPool.query("delete from developers where id = $1", [developerId]);
  }
  await adminPool.end();
});

describe.skipIf(databaseUrl === undefined)("PostgresDashboardRepository", () => {
  it("enforces owner scope and paginates with an opaque cursor", async () => {
    if (adminPool === undefined) {
      throw new Error("DATABASE_URL is required.");
    }
    const owner = await createDeveloperAndApp("owner");
    const other = await createDeveloperAndApp("other");
    for (const [index, createdAt] of [
      "2026-07-21T00:00:03.000Z",
      "2026-07-21T00:00:02.000Z",
      "2026-07-21T00:00:01.000Z"
    ].entries()) {
      await adminPool.query(
        `
          insert into usage_events(
            request_id, app_id, developer_id, route_mode, input_tokens,
            output_tokens, retail_price_usd, channel_revenue_usd, created_at
          )
          values ($1, $2, $3, 'platform', 10, 5, 0.00010000, 0.00002000, $4)
        `,
        [`req_dashboard_${owner.appId}_${index}`, owner.appId, owner.developerId, createdAt]
      );
    }
    await adminPool.query(
      `
        insert into usage_events(request_id, app_id, developer_id, route_mode, created_at)
        values ($1, $2, $3, 'platform', '2026-07-21T00:00:04.000Z')
      `,
      [`req_dashboard_${other.appId}`, other.appId, other.developerId]
    );
    const repository = new PostgresDashboardRepository({ connectionString: databaseUrl });

    const first = await repository.getAppUsage({
      publicAppId: owner.publicAppId,
      developerId: owner.developerId,
      limit: 2
    });
    expect(first.total_calls).toBe(3);
    expect(first.usage.map((row) => row.created_at)).toEqual([
      "2026-07-21T00:00:03.000Z",
      "2026-07-21T00:00:02.000Z"
    ]);
    expect(first.next_cursor).toBeDefined();

    const second = await repository.getAppUsage({
      publicAppId: owner.publicAppId,
      developerId: owner.developerId,
      limit: 2,
      cursor: first.next_cursor
    });
    expect(second.usage.map((row) => row.created_at)).toEqual([
      "2026-07-21T00:00:01.000Z"
    ]);
    expect(second.next_cursor).toBeUndefined();
    await expect(
      repository.getAppUsage({
        publicAppId: owner.publicAppId,
        developerId: other.developerId,
        limit: 2
      })
    ).rejects.toMatchObject({ code: "invalid_app", statusCode: 404 });

    await repository.close();
  });
});
