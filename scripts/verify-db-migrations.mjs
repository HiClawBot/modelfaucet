#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;

const requiredMigrations = new Map([
  ["0001_initial_schema", "Initial ModelFaucet schema"]
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runPsql(query) {
  assert(databaseUrl !== undefined && databaseUrl.trim() !== "", "DATABASE_URL is required.");
  const result = spawnSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-tAc", query],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  if (result.status !== 0) {
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

try {
  const tableExists = runPsql("select to_regclass('public.schema_migrations') is not null;");
  assert(tableExists === "t", "schema_migrations table must exist.");

  const rows = runPsql(
    "select version || '|' || description from schema_migrations order by version;"
  )
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  for (const [version, description] of requiredMigrations.entries()) {
    assert(
      rows.includes(`${version}|${description}`),
      `schema_migrations must include ${version}.`
    );
  }

  console.log(`Database migration verification passed with ${rows.length} recorded migration(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
