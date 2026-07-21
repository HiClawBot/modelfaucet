#!/usr/bin/env node
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function required(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status ?? "unknown"}.`);
  }
}

try {
  const databaseUrl = required("DATABASE_URL");
  const backupFile = resolve(required("BACKUP_FILE"));
  if (existsSync(backupFile)) {
    throw new Error("BACKUP_FILE already exists; backups are never overwritten.");
  }

  mkdirSync(dirname(backupFile), { recursive: true });
  const partialFile = `${backupFile}.partial-${process.pid}`;
  try {
    run("pg_dump", [
      "--format=custom",
      "--compress=6",
      "--no-owner",
      "--no-acl",
      `--file=${partialFile}`,
      databaseUrl
    ]);
    if (statSync(partialFile).size === 0) {
      throw new Error("pg_dump produced an empty backup.");
    }
    renameSync(partialFile, backupFile);
  } catch (error) {
    rmSync(partialFile, { force: true });
    throw error;
  }

  const metricsFile = process.env.BACKUP_METRICS_FILE?.trim();
  if (metricsFile !== undefined && metricsFile !== "") {
    const resolvedMetricsFile = resolve(metricsFile);
    mkdirSync(dirname(resolvedMetricsFile), { recursive: true });
    writeFileSync(
      resolvedMetricsFile,
      `# TYPE modelfaucet_last_successful_backup_timestamp_seconds gauge\n` +
        `modelfaucet_last_successful_backup_timestamp_seconds ${Math.floor(Date.now() / 1000)}\n`,
      { mode: 0o600 }
    );
  }

  console.log(`Database backup completed: ${backupFile}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
