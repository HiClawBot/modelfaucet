#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { readHostedCanaryConfig, runHostedCanary } from "./hosted-canary-lib.mjs";

function readInteger(source, key, defaultValue, maximum) {
  const value = Number(source[key] ?? defaultValue);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${key} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

function readRatio(source, key, defaultValue) {
  const value = Number(source[key] ?? defaultValue);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${key} must be between 0 and 1.`);
  }
  return value;
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

try {
  const config = readHostedCanaryConfig();
  const durationSeconds = readInteger(process.env, "SOAK_DURATION_SECONDS", "3600", 86_400);
  if (durationSeconds < 3600 && process.env.ALLOW_SHORT_SOAK !== "1") {
    throw new Error("SOAK_DURATION_SECONDS must be at least 3600 unless ALLOW_SHORT_SOAK=1.");
  }
  const concurrency = readInteger(process.env, "SOAK_CONCURRENCY", "1", 20);
  const intervalMs = readInteger(process.env, "SOAK_REQUEST_INTERVAL_MS", "10000", 60_000);
  const maxRuns = readInteger(process.env, "SOAK_MAX_RUNS", "360", 100_000);
  const maxFailureRate = readRatio(process.env, "SOAK_MAX_FAILURE_RATE", "0.01");
  const p95LimitMs = readInteger(process.env, "SOAK_P95_LIMIT_MS", "10000", 300_000);
  const deadline = Date.now() + durationSeconds * 1000;
  const startedAt = new Date().toISOString();
  const latencies = [];
  const failures = [];
  let started = 0;
  let succeeded = 0;

  async function worker() {
    while (Date.now() < deadline && started < maxRuns) {
      const runNumber = ++started;
      try {
        const result = await runHostedCanary(config);
        latencies.push(result.total_latency_ms);
        succeeded += 1;
        console.log(
          `PASS ${runNumber}/${maxRuns} request=${result.request_id} latency_ms=${result.total_latency_ms}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ run: runNumber, message: message.slice(0, 300) });
        console.error(`FAIL ${runNumber}/${maxRuns}: ${message}`);
      }
      if (Date.now() < deadline && started < maxRuns) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const completed = succeeded + failures.length;
  const failureRate = completed === 0 ? 1 : failures.length / completed;
  const report = {
    ok: succeeded > 0 && failureRate <= maxFailureRate && percentile(latencies, 0.95) <= p95LimitMs,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    configured_duration_seconds: durationSeconds,
    configured_concurrency: concurrency,
    configured_max_runs: maxRuns,
    completed_runs: completed,
    succeeded_runs: succeeded,
    failed_runs: failures.length,
    failure_rate: failureRate,
    latency_ms: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: latencies.length === 0 ? 0 : Math.max(...latencies)
    },
    thresholds: {
      max_failure_rate: maxFailureRate,
      p95_limit_ms: p95LimitMs
    },
    failures: failures.slice(0, 20)
  };

  const reportJson = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.SOAK_REPORT_FILE?.trim()) {
    await writeFile(process.env.SOAK_REPORT_FILE.trim(), reportJson, { flag: "wx" });
  }
  console.log(reportJson.trim());
  if (!report.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
