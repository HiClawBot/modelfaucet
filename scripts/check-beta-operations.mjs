#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (databaseUrl === undefined || databaseUrl === "") {
  console.error("DATABASE_URL is required for hosted Beta operations checks.");
  process.exit(1);
}

const checks = [
  {
    name: "invalid_wallet_reservations",
    query: `
      select count(*) from wallets
      where balance_usd < 0 or reserved_balance_usd < 0 or reserved_balance_usd > balance_usd
    `
  },
  {
    name: "ledger_mismatches",
    query: `
      with ledger_balances as (
        select wallet_id,
          sum(case when direction = 'credit' then amount_usd else -amount_usd end) as balance
        from ledger_entries
        group by wallet_id
      )
      select count(*)
      from wallets
      left join ledger_balances on ledger_balances.wallet_id = wallets.id
      where wallets.balance_usd <> coalesce(ledger_balances.balance, 0)
    `
  },
  {
    name: "completion_requests_requiring_review",
    query: `
      select count(*) from gateway_completion_requests where status = 'requires_review'
    `
  },
  {
    name: "expired_completion_reservations",
    query: `
      select count(*) from gateway_completion_requests
      where status = 'reserved' and reservation_expires_at < now()
    `
  },
  {
    name: "active_apps_missing_beta_policy",
    query: `
      select count(*) from apps
      where status = 'active'
        and (
          cardinality(allowed_origins) = 0
          or monthly_spend_limit_usd is null
          or session_spend_limit_usd is null
        )
    `
  }
];

function queryCount(sql) {
  const result = spawnSync(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", "-d", databaseUrl, "-At", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Operational database query failed with status ${result.status ?? "unknown"}.`);
  }
  const count = Number(result.stdout.trim());
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Operational database query returned an invalid count.");
  }
  return count;
}

try {
  const results = checks.map((check) => ({ ...check, count: queryCount(check.query) }));
  for (const result of results) {
    console.log(`${result.count === 0 ? "PASS" : "FAIL"} ${result.name}: ${result.count}`);
  }

  const metricsFile = process.env.OPERATIONS_METRICS_FILE?.trim();
  if (metricsFile !== undefined && metricsFile !== "") {
    const resolvedMetricsFile = resolve(metricsFile);
    mkdirSync(dirname(resolvedMetricsFile), { recursive: true });
    writeFileSync(
      resolvedMetricsFile,
      results
        .map(
          (result) =>
            `modelfaucet_operational_invariant_failures{check="${result.name}"} ${result.count}`
        )
        .join("\n") + "\n",
      { mode: 0o600 }
    );
  }

  if (results.some((result) => result.count !== 0)) {
    throw new Error("Hosted Beta operational invariants failed.");
  }
  console.log("Hosted Beta operational checks passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
