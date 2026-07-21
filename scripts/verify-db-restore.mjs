#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function required(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status ?? "unknown"}.`);
  }
  return result.stdout.trim();
}

function isPrivateOrLocal(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

try {
  if (process.env.ALLOW_DATABASE_RESTORE !== "1") {
    throw new Error("ALLOW_DATABASE_RESTORE=1 is required for a restore drill.");
  }
  const backupFile = resolve(required("BACKUP_FILE"));
  if (!existsSync(backupFile)) {
    throw new Error("BACKUP_FILE does not exist.");
  }

  const restoreDatabaseUrl = new URL(required("RESTORE_DATABASE_URL"));
  const databaseName = decodeURIComponent(restoreDatabaseUrl.pathname.replace(/^\//, ""));
  if (!/^[A-Za-z0-9_]+$/.test(databaseName) || !/(restore|verify)/i.test(databaseName)) {
    throw new Error("The restore database name must contain 'restore' or 'verify'.");
  }
  if (
    process.env.ALLOW_REMOTE_RESTORE !== "1" &&
    !isPrivateOrLocal(restoreDatabaseUrl.hostname)
  ) {
    throw new Error("Remote restore targets require ALLOW_REMOTE_RESTORE=1.");
  }
  if (process.env.DATABASE_URL === restoreDatabaseUrl.toString()) {
    throw new Error("RESTORE_DATABASE_URL must not equal DATABASE_URL.");
  }

  const adminDatabaseUrl = new URL(
    process.env.RESTORE_ADMIN_DATABASE_URL?.trim() || restoreDatabaseUrl.toString()
  );
  adminDatabaseUrl.pathname = "/postgres";
  const existing = run("psql", [
    "-X",
    "-At",
    "-d",
    adminDatabaseUrl.toString(),
    "-c",
    `select 1 from pg_database where datname = '${databaseName}';`
  ]);
  if (existing === "1") {
    throw new Error("Restore target already exists; the drill will not overwrite it.");
  }

  run("createdb", [`--maintenance-db=${adminDatabaseUrl.toString()}`, databaseName]);
  let verified = false;
  try {
    run("pg_restore", [
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      `--dbname=${restoreDatabaseUrl.toString()}`,
      backupFile
    ]);
    run(process.execPath, ["scripts/verify-db-migrations.mjs"], {
      env: { ...process.env, DATABASE_URL: restoreDatabaseUrl.toString() }
    });
    const integrity = run("psql", [
      "-X",
      "-At",
      "-d",
      restoreDatabaseUrl.toString(),
      "-c",
      `select case when
        to_regclass('public.gateway_completion_requests') is not null
        and exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'apps' and column_name = 'allowed_origins'
        )
        and not exists (
          select 1 from wallets
          where balance_usd < 0 or reserved_balance_usd < 0 or reserved_balance_usd > balance_usd
        )
      then 'ok' else 'invalid' end;`
    ]);
    if (integrity !== "ok") {
      throw new Error("Restored database integrity checks failed.");
    }
    verified = true;
    console.log(`Database restore verification passed for ${databaseName}.`);
  } finally {
    if (verified && process.env.KEEP_RESTORE_DATABASE !== "1") {
      run("dropdb", [`--maintenance-db=${adminDatabaseUrl.toString()}`, databaseName]);
      console.log(`Removed verified restore database ${databaseName}.`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
