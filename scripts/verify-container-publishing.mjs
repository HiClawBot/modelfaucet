#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function readText(path) {
  return readFileSync(join(repoRoot, path), "utf8");
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

try {
  assertIncludes("infra/docker/node-service.Dockerfile", [
    "ARG SERVICE_PACKAGE",
    "MODELFAUCET_SERVICE_PACKAGE",
    "pnpm --filter \"$MODELFAUCET_SERVICE_PACKAGE\" build",
    "pnpm --filter",
    "start; else pnpm dev"
  ]);

  assertIncludes(".github/workflows/container-images.yml", [
    "ghcr.io/hiclawbot/modelfaucet-api",
    "ghcr.io/hiclawbot/modelfaucet-gateway",
    "ghcr.io/hiclawbot/modelfaucet-dashboard",
    "docker/build-push-action@v6",
    "push: ${{ startsWith(github.ref, 'refs/tags/v') }}"
  ]);

  assertIncludes("infra/hosted/docker-compose.hosted.yml", [
    "ghcr.io/hiclawbot/modelfaucet-api:${MODELFAUCET_IMAGE_TAG:-latest}",
    "ghcr.io/hiclawbot/modelfaucet-gateway:${MODELFAUCET_IMAGE_TAG:-latest}",
    "ghcr.io/hiclawbot/modelfaucet-dashboard:${MODELFAUCET_IMAGE_TAG:-latest}",
    "SERVICE_PACKAGE: \"@modelfaucet/api\"",
    "SERVICE_PACKAGE: \"@modelfaucet/gateway\"",
    "SERVICE_PACKAGE: \"@modelfaucet/dashboard\"",
    "REDIS_URL: ${REDIS_URL:?REDIS_URL is required}",
    "redis:\n        condition: service_healthy"
  ]);

  const hostedCompose = readText("infra/hosted/docker-compose.hosted.yml");
  assert(
    !hostedCompose.includes("VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN"),
    "Hosted dashboard image must not receive VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN."
  );
  assert(
    !hostedCompose.includes("VITE_MODELFAUCET_DEVELOPER_TOKEN"),
    "Hosted dashboard image must not receive VITE_MODELFAUCET_DEVELOPER_TOKEN."
  );

  console.log("Container publishing verification passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
