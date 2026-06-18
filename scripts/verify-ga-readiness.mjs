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
  assert(packageJson.version === "1.2.0", "package.json version must be 1.2.0.");
  assert(packageJson.scripts["ga:verify"] === "node scripts/verify-ga-readiness.mjs", "ga:verify script must be registered.");
  assert(packageJson.scripts["compose:verify"] === "node scripts/verify-compose-config.mjs", "compose:verify script must be registered.");
  assert(packageJson.scripts["deps:review"] === "pnpm outdated -r", "deps:review script must be registered.");
  assert(packageJson.scripts["hosted:verify-env"] !== undefined, "hosted env verifier must remain registered.");
  assert(packageJson.scripts["hosted:check-isolation"] !== undefined, "hosted isolation checker must remain registered.");
  assert(packageJson.scripts["hosted:smoke-readiness"] !== undefined, "hosted readiness smoke must remain registered.");
  assert(packageJson.scripts["website:build"] === "pnpm --filter @modelfaucet/website build", "website build script must be registered.");
  assert(packageJson.scripts["pages:build"] === "node scripts/build-pages-site.mjs", "Pages build script must be registered.");

  assertIncludes("README.md", ["Status: `1.2.0` source GA website and scenario demo release", "independent GitHub Pages website", "scoped developer API tokens"]);
  assertIncludes("README.zh-CN.md", ["状态：`1.2.0` source GA website and scenario demo release", "独立 GitHub Pages 官网", "scoped developer API tokens"]);
  assertIncludes("CHANGELOG.md", ["## 1.2.0 - 2026-06-18", "Independent bilingual React website", "Static scenario model"]);

  const requiredDocs = [
    "docs/stability-policy.md",
    "docs/migration-upgrade.md",
    "docs/production-architecture.md",
    "docs/developer-auth.md",
    "docs/governance-support.md",
    "docs/publishing-strategy.md",
    "docs/deployment-validation.md",
    "docs/zh-CN/stability-policy.md",
    "docs/zh-CN/migration-upgrade.md",
    "docs/zh-CN/production-architecture.md",
    "docs/zh-CN/developer-auth.md",
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
  assertIncludes("docs/developer-auth.md", [
    "Developer API tokens are generated server-side",
    "Provider API keys remain server-side only",
    "Tenant Isolation"
  ]);
  assertIncludes("docs/governance-support.md", ["Support Policy", "Release Cadence"]);
  assertIncludes("docs/publishing-strategy.md", ["Package Publishing", "Container Image Publishing"]);
  assertIncludes("docs/deployment-validation.md", ["Docker/Compose Validation", "Secret Manager", "CORS"]);
  assertIncludes("docs/roadmap.md", ["`1.2.0` | Website and scenario demo", "`1.3.0` | Deployment release", "Website And Scenario Demo"]);
  assertIncludes("docs/zh-CN/roadmap.md", ["`1.2.0` | 官网和场景 demo", "`1.3.0` | Deployment release", "官网和场景 Demo"]);
  assertIncludes("docs/RELEASE_CHECKLIST.md", ["pnpm website:build", "pnpm pages:build", "public website and scenario demo remain static"]);

  assertIncludes("docs/.vitepress/config.mts", [
    "/stability-policy",
    "/migration-upgrade",
    "/production-architecture",
    "/developer-auth",
    "/governance-support",
    "/publishing-strategy",
    "/deployment-validation",
    "/zh-CN/stability-policy",
    "/zh-CN/migration-upgrade",
    "/zh-CN/production-architecture",
    "/zh-CN/developer-auth",
    "/zh-CN/governance-support",
    "/zh-CN/publishing-strategy",
    "/zh-CN/deployment-validation"
  ]);

  const hostedCompose = readText("infra/hosted/docker-compose.hosted.yml");
  assert(
    !hostedCompose.includes("VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN"),
    "Hosted dashboard must not receive VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN."
  );
  assert(
    !hostedCompose.includes("VITE_MODELFAUCET_DEVELOPER_TOKEN"),
    "Hosted dashboard must not receive VITE_MODELFAUCET_DEVELOPER_TOKEN."
  );

  assertIncludes("apps/website/package.json", ["@modelfaucet/website", "vite --host 127.0.0.1"]);
  assertIncludes("apps/website/src/App.tsx", [
    "Provider API keys stay server-side only.",
    "BYOK has visible controls and no hidden markup.",
    "Cloud services refuse localhost, metadata, link-local, and private LAN URLs."
  ]);
  assertIncludes("scripts/build-pages-site.mjs", [".pages-dist", "copyIndexToRoute(\"demo\")", "copyIndexToRoute(\"use-cases\")"]);
  assertIncludes(".github/workflows/pages.yml", ["apps/website/**", "pnpm pages:build", ".pages-dist"]);
  assertIncludes(".github/workflows/ci.yml", ["Build website", "Build Pages artifact"]);

  const websiteApp = readText("apps/website/src/App.tsx");
  assert(!websiteApp.includes('type="hidden"'), "Website must not include hidden BYOK or provider-key markup.");
  assert(!websiteApp.includes('type="password"'), "Website must not include provider-key password inputs.");

  console.log("GA readiness verification passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
