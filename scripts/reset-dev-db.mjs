#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assertLocalDatabaseUrl(value) {
  if (value === undefined || value.trim() === "") {
    throw new Error("DATABASE_URL is required.");
  }

  const parsed = new URL(value);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
  if (!localHosts.has(parsed.hostname) && !process.argv.includes("--allow-remote")) {
    throw new Error(
      "Refusing to reset a non-local database. Pass --allow-remote only for disposable environments."
    );
  }
}

assertLocalDatabaseUrl(databaseUrl);

run("psql", [
  "-v",
  "ON_ERROR_STOP=1",
  "-d",
  databaseUrl,
  "-c",
  "drop schema public cascade; create schema public;"
]);
run("pnpm", ["db:migrate"], { env: process.env });
run("pnpm", ["db:seed"], { env: process.env });

console.log("Development database reset and seed completed.");

