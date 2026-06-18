#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === "") {
  console.error("DATABASE_URL is required for hosted tenant isolation checks.");
  process.exit(1);
}

const checks = [
  {
    name: "usage events must match app developer ownership",
    query: `
      select count(*)
      from usage_events ue
      join apps a on a.id = ue.app_id
      where ue.developer_id <> a.developer_id
    `
  },
  {
    name: "usage events with end users must match the same app",
    query: `
      select count(*)
      from usage_events ue
      join end_users eu on eu.id = ue.end_user_id
      where eu.app_id <> ue.app_id
    `
  },
  {
    name: "virtual sessions must bind end users to the same app",
    query: `
      select count(*)
      from virtual_sessions vs
      join end_users eu on eu.id = vs.end_user_id
      where eu.app_id <> vs.app_id
    `
  },
  {
    name: "developer provider credentials must have a developer owner",
    query: `
      select count(*)
      from provider_credentials pc
      left join developers d on d.id = pc.owner_id
      where pc.owner_scope = 'developer' and d.id is null
    `
  },
  {
    name: "end-user provider credentials must have an end-user owner",
    query: `
      select count(*)
      from provider_credentials pc
      left join end_users eu on eu.id = pc.owner_id
      where pc.owner_scope = 'end_user' and eu.id is null
    `
  },
  {
    name: "developer wallets must have a developer owner",
    query: `
      select count(*)
      from wallets w
      left join developers d on d.id = w.owner_id
      where w.owner_scope = 'developer' and d.id is null
    `
  },
  {
    name: "end-user wallets must have an end-user owner",
    query: `
      select count(*)
      from wallets w
      left join end_users eu on eu.id = w.owner_id
      where w.owner_scope = 'end_user' and eu.id is null
    `
  }
];

function queryScalar(query) {
  const result = spawnSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-At", "-c", query],
    {
      encoding: "utf8"
    }
  );

  if (result.status !== 0) {
    throw new Error(`psql failed:\n${result.stdout}\n${result.stderr}`);
  }

  return result.stdout.trim();
}

try {
  for (const check of checks) {
    const count = Number(queryScalar(check.query));
    if (!Number.isInteger(count)) {
      throw new Error(`${check.name} returned a non-integer result.`);
    }

    if (count !== 0) {
      throw new Error(`${check.name} failed with ${count} mismatched rows.`);
    }

    console.log(`PASS ${check.name}`);
  }

  console.log("Hosted tenant isolation checks passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
