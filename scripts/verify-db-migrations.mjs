#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { loadMigrationManifest } from "./migration-manifest.mjs";

const databaseUrl = process.env.DATABASE_URL;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runPsql(query) {
  assert(databaseUrl !== undefined && databaseUrl.trim() !== "", "DATABASE_URL is required.");
  const result = spawnSync(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-tAc", query],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "psql migration verification failed.");
  }
  return result.stdout.trim();
}

try {
  const migrations = loadMigrationManifest();
  const tableExists = runPsql("select to_regclass('public.schema_migrations') is not null;");
  assert(tableExists === "t", "schema_migrations table must exist.");

  const rows = runPsql(
    "select version || E'\\t' || description || E'\\t' || coalesce(checksum, '') from schema_migrations order by version;"
  )
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map((row) => row.split("\t"));
  const rowByVersion = new Map(rows.map((row) => [row[0], row]));

  for (const migration of migrations) {
    const row = rowByVersion.get(migration.version);
    assert(row !== undefined, `schema_migrations must include ${migration.version}.`);
    assert(row[1] === migration.description, `${migration.version} description does not match.`);
    assert(row[2] === migration.checksum, `${migration.version} checksum does not match.`);
  }

  console.log(`Database migration verification passed with ${rows.length} recorded migration(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
