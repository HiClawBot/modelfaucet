#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function readText(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(path, markers) {
  const content = readText(path);
  for (const marker of markers) {
    assert(content.includes(marker), `${path} must include ${marker}`);
  }
}

const packageJson = readJson("package.json");

try {
  assert(packageJson.version === "1.0.1", "package.json version must be 1.0.1.");
  assert(packageJson.scripts["ga:verify"] === "node scripts/verify-ga-readiness.mjs", "ga:verify script must be registered.");
  assert(packageJson.scripts["compose:verify"] === "node scripts/verify-compose-config.mjs", "compose:verify script must be registered.");
  assert(packageJson.scripts["deps:review"] === "pnpm outdated -r", "deps:review script must be registered.");
  assert(packageJson.scripts["hosted:verify-env"] !== undefined, "hosted env verifier must remain registered.");
  assert(packageJson.scripts["hosted:check-isolation"] !== undefined, "hosted isolation checker must remain registered.");
  assert(packageJson.scripts["hosted:smoke-readiness"] !== undefined, "hosted readiness smoke must remain registered.");

  assertIncludes("README.md", ["Status: `1.0.1` source GA hardening patch", "stable public contracts"]);
  assertIncludes("README.zh-CN.md", ["状态：`1.0.1` source GA hardening patch", "稳定公共契约"]);
  assertIncludes("CHANGELOG.md", ["## 1.0.1 - 2026-06-18", "Hardening patch"]);

  const requiredDocs = [
    "docs/stability-policy.md",
    "docs/migration-upgrade.md",
    "docs/production-architecture.md",
    "docs/governance-support.md",
    "docs/publishing-strategy.md",
    "docs/deployment-validation.md",
    "docs/zh-CN/stability-policy.md",
    "docs/zh-CN/migration-upgrade.md",
    "docs/zh-CN/production-architecture.md",
    "docs/zh-CN/governance-support.md",
    "docs/zh-CN/publishing-strategy.md",
    "docs/zh-CN/deployment-validation.md"
  ];

  for (const doc of requiredDocs) {
    assert(readText(doc).trim().length > 0, `${doc} must exist and be non-empty.`);
  }

  assertIncludes("docs/stability-policy.md", [
    "Provider API keys stay server-side only",
    "No hidden BYOK markup",
    "Cloud services must not access localhost or private LAN URLs"
  ]);
  assertIncludes("docs/migration-upgrade.md", ["Upgrade From `0.9.0` To `1.0.0`", "Rollback"]);
  assertIncludes("docs/production-architecture.md", ["Secret Manager", "Private-Network Guard", "Incident Response"]);
  assertIncludes("docs/governance-support.md", ["Support Policy", "Release Cadence"]);
  assertIncludes("docs/publishing-strategy.md", ["Package Publishing", "Container Image Publishing"]);
  assertIncludes("docs/deployment-validation.md", ["Docker/Compose Validation", "Secret Manager", "CORS"]);

  assertIncludes("docs/.vitepress/config.mts", [
    "/stability-policy",
    "/migration-upgrade",
    "/production-architecture",
    "/governance-support",
    "/publishing-strategy",
    "/deployment-validation",
    "/zh-CN/stability-policy",
    "/zh-CN/migration-upgrade",
    "/zh-CN/production-architecture",
    "/zh-CN/governance-support",
    "/zh-CN/publishing-strategy",
    "/zh-CN/deployment-validation"
  ]);

  const hostedCompose = readText("infra/hosted/docker-compose.hosted.yml");
  assert(
    !hostedCompose.includes("VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN"),
    "Hosted dashboard must not receive VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN."
  );

  console.log("GA readiness verification passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
