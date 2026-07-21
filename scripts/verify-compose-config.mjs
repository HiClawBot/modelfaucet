#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const hostedEnv = {
  ...process.env,
  MODELFAUCET_API_IMAGE:
    process.env.MODELFAUCET_API_IMAGE ??
    "ghcr.io/hiclawbot/modelfaucet-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  MODELFAUCET_GATEWAY_IMAGE:
    process.env.MODELFAUCET_GATEWAY_IMAGE ??
    "ghcr.io/hiclawbot/modelfaucet-gateway@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  MODELFAUCET_DASHBOARD_IMAGE:
    process.env.MODELFAUCET_DASHBOARD_IMAGE ??
    "ghcr.io/hiclawbot/modelfaucet-dashboard@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://modelfaucet:modelfaucet@db.modelfaucet.invalid:3200/modelfaucet",
  REDIS_URL: process.env.REDIS_URL ?? "redis://redis.modelfaucet.invalid:3290",
  SECRET_ENCRYPTION_KEY:
    process.env.SECRET_ENCRYPTION_KEY ?? "mf_ci_secret_encryption_key_32_bytes_minimum",
  ADMIN_TOKEN: process.env.ADMIN_TOKEN ?? "mf_ci_admin_token_for_hosted_env_check",
  DEVELOPER_ADMIN_TOKEN: process.env.DEVELOPER_ADMIN_TOKEN ?? "mf_ci_developer_admin_token_check",
  METRICS_TOKEN: process.env.METRICS_TOKEN ?? "mf_ci_metrics_token_for_hosted_check",
  TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS ?? "1",
  API_PLATFORM_ONLY: process.env.API_PLATFORM_ONLY ?? "1",
  GATEWAY_PLATFORM_ONLY: process.env.GATEWAY_PLATFORM_ONLY ?? "1",
  API_ENABLE_STRIPE_PAYMENTS: process.env.API_ENABLE_STRIPE_PAYMENTS ?? "0",
  API_ENABLE_PAYOUTS: process.env.API_ENABLE_PAYOUTS ?? "0",
  API_ENABLE_PROVIDER_KEYS: process.env.API_ENABLE_PROVIDER_KEYS ?? "0",
  API_ENABLE_TEST_CREDITS: process.env.API_ENABLE_TEST_CREDITS ?? "0",
  API_REQUIRE_SESSION_ORIGIN: process.env.API_REQUIRE_SESSION_ORIGIN ?? "1",
  API_SESSION_RATE_LIMIT_MAX_REQUESTS: process.env.API_SESSION_RATE_LIMIT_MAX_REQUESTS ?? "60",
  API_SESSION_RATE_LIMIT_WINDOW_MS: process.env.API_SESSION_RATE_LIMIT_WINDOW_MS ?? "60000",
  LITELLM_MASTER_KEY: process.env.LITELLM_MASTER_KEY ?? "mf_ci_litellm_master_key_for_hosted_check",
  API_CORS_ORIGINS: process.env.API_CORS_ORIGINS ?? "https://dashboard.modelfaucet.invalid",
  GATEWAY_CORS_ORIGINS: process.env.GATEWAY_CORS_ORIGINS ?? "https://crm-demo.modelfaucet.invalid",
  API_PUBLIC_BASE_URL: process.env.API_PUBLIC_BASE_URL ?? "https://api.modelfaucet.invalid",
  DASHBOARD_PUBLIC_APP_ID: process.env.DASHBOARD_PUBLIC_APP_ID ?? "app_ci_hosted",
  GATEWAY_PLATFORM_MODEL: process.env.GATEWAY_PLATFORM_MODEL ?? "auto-text",
  GATEWAY_PLATFORM_INPUT_PRICE_PER_1M_TOKENS_USD:
    process.env.GATEWAY_PLATFORM_INPUT_PRICE_PER_1M_TOKENS_USD ?? "1.00000000",
  GATEWAY_PLATFORM_OUTPUT_PRICE_PER_1M_TOKENS_USD:
    process.env.GATEWAY_PLATFORM_OUTPUT_PRICE_PER_1M_TOKENS_USD ?? "2.00000000",
  GATEWAY_PLATFORM_MARKUP_PERCENT: process.env.GATEWAY_PLATFORM_MARKUP_PERCENT ?? "30",
  GATEWAY_PLATFORM_MAX_INPUT_TOKENS: process.env.GATEWAY_PLATFORM_MAX_INPUT_TOKENS ?? "8192",
  GATEWAY_PLATFORM_MAX_OUTPUT_TOKENS: process.env.GATEWAY_PLATFORM_MAX_OUTPUT_TOKENS ?? "1024",
  GATEWAY_RESERVATION_TTL_MS: process.env.GATEWAY_RESERVATION_TTL_MS ?? "120000"
};

const configs = [
  {
    name: "default Docker Compose",
    args: ["compose", "config"],
    env: process.env
  },
  {
    name: "hosted Docker Compose",
    args: ["compose", "-f", "infra/hosted/docker-compose.hosted.yml", "config"],
    env: hostedEnv
  }
];

function runDocker(args, env) {
  return spawnSync("docker", args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

for (const config of configs) {
  const result = runDocker(config.args, config.env);

  if (result.error?.code === "ENOENT") {
    if (process.env.COMPOSE_VERIFY_ALLOW_MISSING_DOCKER === "1") {
      console.warn(
        `SKIP ${config.name}: docker is not installed; rerun without COMPOSE_VERIFY_ALLOW_MISSING_DOCKER on a Docker-capable host.`
      );
      continue;
    }

    console.error(
      `${config.name} could not run because docker is not installed. Set COMPOSE_VERIFY_ALLOW_MISSING_DOCKER=1 only for local non-Docker development.`
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${config.name} failed.`);
    if (result.stdout.trim()) {
      console.error(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    process.exit(result.status ?? 1);
  }

  console.log(`PASS ${config.name}`);
}

console.log("Compose config verification completed.");
