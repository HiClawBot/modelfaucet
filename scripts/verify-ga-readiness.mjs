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
  assert(
    packageJson.version === "1.3.0-beta.1",
    "package.json version must be 1.3.0-beta.1 for this construction candidate."
  );
  assert(
    packageJson.scripts["ga:verify"] === "node scripts/verify-ga-readiness.mjs",
    "ga:verify script must be registered."
  );
  assert(
    packageJson.scripts["compose:verify"] === "node scripts/verify-compose-config.mjs",
    "compose:verify script must be registered."
  );
  assert(
    packageJson.scripts["container:verify"] === "node scripts/verify-container-publishing.mjs",
    "container:verify script must be registered."
  );
  assert(
    packageJson.scripts["db:verify-migrations"] === "node scripts/verify-db-migrations.mjs",
    "database migration verifier must be registered."
  );
  assert(
    packageJson.scripts["db:migrate"] === "node scripts/migrate-db.mjs",
    "ordered migration runner must be registered."
  );
  assert(
    packageJson.scripts["db:bootstrap:production"] === "node scripts/bootstrap-production.mjs",
    "production bootstrap must be registered."
  );
  assert(
    packageJson.scripts["db:backup"] === "node scripts/backup-db.mjs",
    "database backup script must be registered."
  );
  assert(
    packageJson.scripts["db:restore:verify"] === "node scripts/verify-db-restore.mjs",
    "database restore verifier must be registered."
  );
  assert(
    packageJson.scripts["deps:review"] === "pnpm outdated -r",
    "deps:review script must be registered."
  );
  assert(
    packageJson.scripts["hosted:verify-env"] !== undefined,
    "hosted env verifier must remain registered."
  );
  assert(
    packageJson.scripts["hosted:check-isolation"] !== undefined,
    "hosted isolation checker must remain registered."
  );
  assert(
    packageJson.scripts["hosted:check-operations"] === "node scripts/check-beta-operations.mjs",
    "hosted operational checker must remain registered."
  );
  assert(
    packageJson.scripts["hosted:smoke-readiness"] !== undefined,
    "hosted readiness smoke must remain registered."
  );
  assert(
    packageJson.scripts["docs:build"] ===
      "node ./node_modules/vitepress/bin/vitepress.js build docs",
    "docs build script must use the VitePress CLI."
  );
  assert(
    packageJson.scripts["website:build"] === "pnpm --filter @modelfaucet/website build",
    "website build script must be registered."
  );
  assert(
    packageJson.scripts["pages:build"] === "node scripts/build-pages-site.mjs",
    "Pages build script must be registered."
  );

  assertIncludes("README.md", [
    "Status: `v1.3.0-beta.1` construction candidate",
    "capability matrix",
    "Independent bilingual GitHub Pages website"
  ]);
  assertIncludes("README.zh-CN.md", [
    "状态：`v1.3.0-beta.1` 施工候选",
    "能力矩阵",
    "独立双语 GitHub Pages 官网"
  ]);
  assertIncludes("CHANGELOG.md", [
    "## 1.3.0-beta.1 - 2026-07-21",
    "Redis-backed fixed-window rate limiter",
    "schema_migrations",
    "Container image publishing workflow"
  ]);

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
  assertIncludes("docs/production-architecture.md", [
    "Secret Manager",
    "Private-Network Guard",
    "Incident Response"
  ]);
  assertIncludes("docs/developer-auth.md", [
    "Developer API tokens are generated server-side",
    "Provider API keys remain server-side only",
    "Tenant Isolation"
  ]);
  assertIncludes("docs/governance-support.md", ["Support Policy", "Release Cadence"]);
  assertIncludes("docs/publishing-strategy.md", [
    "Package Publishing",
    "Container Image Publishing"
  ]);
  assertIncludes("docs/deployment-validation.md", [
    "Docker/Compose Validation",
    "Secret Manager",
    "CORS"
  ]);
  assertIncludes("docs/operations.md", [
    "REDIS_URL=redis://redis:3290",
    "pnpm db:verify-migrations",
    "pnpm db:backup",
    "pnpm db:restore:verify"
  ]);
  assertIncludes("docs/zh-CN/operations.md", [
    "REDIS_URL=redis://redis:3290",
    "pnpm db:verify-migrations",
    "pnpm db:backup",
    "pnpm db:restore:verify"
  ]);
  assertIncludes("docs/migration-upgrade.md", [
    "Upgrade To `1.3.0-beta.1`",
    "pnpm container:verify",
    "REDIS_URL"
  ]);
  assertIncludes("docs/zh-CN/migration-upgrade.md", [
    "升级到 `1.3.0-beta.1`",
    "pnpm container:verify",
    "REDIS_URL"
  ]);
  assertIncludes("docs/publishing-strategy.md", [
    "ModelFaucet `1.3.0-beta.1`",
    ".github/workflows/container-images.yml",
    "ghcr.io/hiclawbot/modelfaucet-api",
    "pnpm container:verify"
  ]);
  assertIncludes("docs/zh-CN/publishing-strategy.md", [
    "ModelFaucet `1.3.0-beta.1`",
    ".github/workflows/container-images.yml",
    "ghcr.io/hiclawbot/modelfaucet-api",
    "pnpm container:verify"
  ]);
  assertIncludes("docs/roadmap.md", [
    "ModelFaucet `1.3.0-beta.1` is a hosted Beta construction candidate",
    "`1.3.0-beta.1` | Hosted Beta candidate",
    "`1.3.0-beta.1` Hosted Beta Candidate",
    "Redis URL remains server-side only"
  ]);
  assertIncludes("docs/zh-CN/roadmap.md", [
    "ModelFaucet `1.3.0-beta.1` 是 hosted Beta 施工候选",
    "`1.3.0-beta.1` | Hosted Beta 候选",
    "`1.3.0-beta.1` Hosted Beta 候选",
    "Redis URL 只保存在服务端"
  ]);
  assertIncludes("docs/RELEASE_CHECKLIST.md", [
    "pnpm website:build",
    "pnpm pages:build",
    "pnpm container:verify",
    "pnpm db:verify-migrations",
    "server-side `REDIS_URL`",
    "public website and scenario demo remain static"
  ]);

  assertIncludes("docs/.vitepress/config.mts", [
    "/assets/modelfaucet-mark.svg",
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
  assertIncludes("infra/hosted/docker-compose.hosted.yml", [
    "${MODELFAUCET_API_IMAGE:?MODELFAUCET_API_IMAGE digest reference is required}",
    "${MODELFAUCET_GATEWAY_IMAGE:?MODELFAUCET_GATEWAY_IMAGE digest reference is required}",
    "${MODELFAUCET_DASHBOARD_IMAGE:?MODELFAUCET_DASHBOARD_IMAGE digest reference is required}",
    "REDIS_URL: ${REDIS_URL:?REDIS_URL is required}"
  ]);
  assert(
    !hostedCompose.includes("VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN"),
    "Hosted dashboard must not receive VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN."
  );
  assert(
    !hostedCompose.includes("VITE_MODELFAUCET_DEVELOPER_TOKEN"),
    "Hosted dashboard must not receive VITE_MODELFAUCET_DEVELOPER_TOKEN."
  );

  assertIncludes(".env.hosted.example", ["REDIS_URL=redis://redis:3290"]);
  assertIncludes("scripts/verify-hosted-env.mjs", ["REDIS_URL", "assertRedisUrl"]);
  assertIncludes("scripts/verify-compose-config.mjs", [
    "REDIS_URL",
    "redis://redis.modelfaucet.invalid:3290"
  ]);
  assertIncludes("infra/db/schema.sql", ["schema_migrations", "checksum text"]);
  assertIncludes("infra/db/migrations/manifest.json", [
    "0001_initial_schema",
    "adoptLegacyChecksum"
  ]);
  assertIncludes("scripts/migrate-db.mjs", ["pg_advisory_lock", "Migration metadata mismatch"]);
  assertIncludes("scripts/verify-db-migrations.mjs", [
    "schema_migrations table must exist",
    "checksum does not match"
  ]);
  assertIncludes("scripts/bootstrap-production.mjs", [
    "Production bootstrap completed without creating credits or changing balances"
  ]);
  assertIncludes("scripts/backup-db.mjs", ["--format=custom", "BACKUP_FILE already exists"]);
  assertIncludes("scripts/verify-db-restore.mjs", [
    "ALLOW_DATABASE_RESTORE=1",
    "will not overwrite it",
    "verify-db-migrations.mjs"
  ]);
  assertIncludes("scripts/check-beta-operations.mjs", [
    "ledger_mismatches",
    "completion_requests_requiring_review",
    "active_apps_missing_beta_policy"
  ]);
  assertIncludes("scripts/smoke-hosted-readiness.mjs", [
    "MODELFAUCET_METRICS_TOKEN",
    "Gateway metrics",
    "provider health response was not healthy"
  ]);
  assertIncludes("scripts/hosted-canary-lib.mjs", [
    "ALLOW_PROVIDER_BILLING",
    "idempotency_replay_verified",
    "Canary wallet has no spendable balance"
  ]);
  assertIncludes("scripts/soak-hosted-canary.mjs", [
    "SOAK_DURATION_SECONDS",
    "SOAK_MAX_FAILURE_RATE",
    "SOAK_P95_LIMIT_MS"
  ]);
  assertIncludes("infra/monitoring/prometheus-alerts.yml", [
    "ModelFaucetServiceDown",
    "ModelFaucetReadinessFailed",
    "ModelFaucetHighServerErrorRatio",
    "ModelFaucetRateLimitSurge",
    "ModelFaucetBackupStale",
    "ModelFaucetOperationalInvariantFailure"
  ]);
  assertIncludes("infra/monitoring/prometheus-alerts.test.yml", [
    "ModelFaucetServiceDown",
    "ModelFaucetReadinessFailed",
    "ModelFaucetHighServerErrorRatio",
    "ModelFaucetRateLimitSurge",
    "ModelFaucetBackupStale",
    "ModelFaucetOperationalInvariantFailure"
  ]);
  assertIncludes(".github/workflows/ci.yml", [
    "prom/prometheus:v3.13.1",
    "promtool check rules",
    "promtool test rules"
  ]);
  assertIncludes(".github/workflows/ci.yml", [
    "Verify database backup and restore drill",
    "pnpm db:restore:verify"
  ]);
  assertIncludes("turbo.json", ['"cache": false', '"env": ["DATABASE_URL"]']);
  assertIncludes("scripts/verify-container-publishing.mjs", [
    "Container publishing verification passed",
    "REDIS_URL",
    "ghcr.io/hiclawbot/modelfaucet-api"
  ]);
  assertIncludes("scripts/verify-release-candidate.mjs", [
    "RELEASE_TAG",
    "REQUIRE_CLEAN_WORKTREE",
    "Release candidate metadata verification passed"
  ]);
  assertIncludes("package.json", ['"version": "1.3.0-beta.1"', '"release:verify"']);
  assertIncludes(".github/workflows/container-images.yml", [
    "ghcr.io/hiclawbot/modelfaucet-api",
    "ghcr.io/hiclawbot/modelfaucet-gateway",
    "ghcr.io/hiclawbot/modelfaucet-dashboard",
    "docker/build-push-action@v6",
    "push: ${{ startsWith(github.ref, 'refs/tags/v') }}",
    "steps.build.outputs.digest",
    "docker buildx imagetools inspect",
    "attest-build-provenance",
    "upload-artifact"
  ]);
  assertIncludes("infra/docker/node-service.Dockerfile", [
    "ARG SERVICE_PACKAGE",
    "COPY apps/website/package.json apps/website/package.json",
    'pnpm --filter "$MODELFAUCET_SERVICE_PACKAGE" build'
  ]);
  assertIncludes("apps/api/package.json", ['"redis"']);
  assertIncludes("apps/gateway/package.json", ['"redis"']);
  assertIncludes("apps/api/src/env.ts", ["redisUrl", "REDIS_URL"]);
  assertIncludes("apps/gateway/src/env.ts", ["redisUrl", "REDIS_URL"]);
  assertIncludes("apps/api/src/rateLimit.ts", [
    "RedisFixedWindowRateLimiter",
    "createApiRateLimiter",
    "modelfaucet:api:rate-limit"
  ]);
  assertIncludes("apps/gateway/src/rateLimit.ts", [
    "RedisFixedWindowRateLimiter",
    "createGatewayRateLimiter",
    "modelfaucet:gateway:rate-limit"
  ]);
  assertIncludes("apps/api/src/server.ts", [
    "type RateLimiter",
    "await options.rateLimiter.check",
    "options.rateLimiter?.close"
  ]);
  assertIncludes("apps/gateway/src/server.ts", [
    "type RateLimiter",
    "options.rateLimiter?.check",
    "options.rateLimiter?.close"
  ]);
  assertIncludes("apps/api/test/rateLimit.test.ts", ["RedisFixedWindowRateLimiter", "disconnects"]);
  assertIncludes("apps/gateway/test/rateLimit.test.ts", [
    "RedisFixedWindowRateLimiter",
    "disconnects"
  ]);

  assertIncludes("assets/modelfaucet-logo.svg", ["#0B1D3A", "#2563FF"]);
  assertIncludes("assets/modelfaucet-mark.svg", ["#0B1D3A", "#2563FF"]);
  assertIncludes("assets/modelfaucet-app-icon.svg", ["#0B1D3A", "#2563FF"]);
  assertIncludes("apps/website/public/assets/modelfaucet-logo.svg", ["#0B1D3A", "#2563FF"]);
  assertIncludes("docs/public/assets/modelfaucet-logo.svg", ["#0B1D3A", "#2563FF"]);
  assertIncludes("scripts/build-pages-site.mjs", [
    'copyIndexToRoute("demo")',
    'copyIndexToRoute("use-cases")',
    'copyIndexToRoute("zh")',
    'copyIndexToRoute("zh/demo")',
    'copyIndexToRoute("zh/use-cases")'
  ]);

  assertIncludes("apps/website/package.json", [
    "@modelfaucet/website",
    '"version": "1.3.0-beta.1"',
    "vite --host 127.0.0.1"
  ]);
  assertIncludes("apps/website/src/App.tsx", [
    "Provider API keys stay server-side only.",
    "BYOK has visible controls and no hidden markup.",
    "Cloud services refuse localhost, metadata, link-local, and private LAN URLs."
  ]);
  assertIncludes("apps/website/test/i18n.test.ts", [
    "keeps the English website copy free of Chinese characters",
    "/modelfaucet/zh/demo/"
  ]);
  assertIncludes("scripts/build-pages-site.mjs", [
    ".pages-dist",
    'copyIndexToRoute("demo")',
    'copyIndexToRoute("use-cases")'
  ]);
  assertIncludes(".github/workflows/pages.yml", [
    "apps/website/**",
    "pnpm pages:build",
    ".pages-dist"
  ]);
  assertIncludes(".github/workflows/ci.yml", ["Build website", "Build Pages artifact"]);

  const websiteApp = readText("apps/website/src/App.tsx");
  assert(
    !websiteApp.includes('type="hidden"'),
    "Website must not include hidden BYOK or provider-key markup."
  );
  assert(
    !websiteApp.includes('type="password"'),
    "Website must not include provider-key password inputs."
  );

  console.log("GA readiness verification passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
