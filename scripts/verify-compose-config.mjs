#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const hostedEnv = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://modelfaucet:modelfaucet@db.modelfaucet.invalid:5432/modelfaucet",
  SECRET_ENCRYPTION_KEY:
    process.env.SECRET_ENCRYPTION_KEY ?? "mf_ci_secret_encryption_key_32_bytes_minimum",
  ADMIN_TOKEN: process.env.ADMIN_TOKEN ?? "mf_ci_admin_token_for_hosted_env_check",
  DEVELOPER_ADMIN_TOKEN:
    process.env.DEVELOPER_ADMIN_TOKEN ?? "mf_ci_developer_admin_token_check",
  LITELLM_MASTER_KEY:
    process.env.LITELLM_MASTER_KEY ?? "mf_ci_litellm_master_key_for_hosted_check",
  API_CORS_ORIGINS:
    process.env.API_CORS_ORIGINS ?? "https://dashboard.modelfaucet.invalid",
  GATEWAY_CORS_ORIGINS:
    process.env.GATEWAY_CORS_ORIGINS ?? "https://crm-demo.modelfaucet.invalid",
  API_PUBLIC_BASE_URL:
    process.env.API_PUBLIC_BASE_URL ?? "https://api.modelfaucet.invalid"
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
