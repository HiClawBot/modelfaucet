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
    "node:22.23.1-bookworm-slim",
    "ARG SERVICE_PACKAGE",
    "MODELFAUCET_SERVICE_PACKAGE",
    'pnpm --filter "$MODELFAUCET_SERVICE_PACKAGE" build',
    "deploy --prod /out",
    "COPY --from=build --chown=node:node /out/ ./",
    "USER node",
    'CMD ["npm", "start", "--silent"]'
  ]);

  assertIncludes(".github/workflows/container-images.yml", [
    "ghcr.io/hiclawbot/modelfaucet-api",
    "ghcr.io/hiclawbot/modelfaucet-gateway",
    "ghcr.io/hiclawbot/modelfaucet-dashboard",
    "docker/build-push-action@v6",
    "Verify clean release candidate metadata",
    "RELEASE_TAG",
    "push: ${{ startsWith(github.ref, 'refs/tags/v') }}",
    "load: true",
    "steps.build.outputs.digest",
    "docker buildx imagetools inspect",
    "actions/attest-build-provenance@0f67c3f4856b2e3261c31976d6725780e5e4c373",
    "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    "PUBLISHED_IMAGE_REF",
    "Smoke production image",
    "Config.User"
  ]);
  const containerWorkflow = readText(".github/workflows/container-images.yml");
  assert(
    (containerWorkflow.match(/-e REDIS_URL="\$redis_url"/g) ?? []).length === 2,
    "API and Gateway production image smokes must both receive the required REDIS_URL."
  );
  assertIncludes(".github/workflows/container-images.yml", [
    "redis:7.4.9-bookworm",
    "docker network create",
    "redis-cli ping",
    "Redis sidecar did not become healthy"
  ]);

  assertIncludes("infra/hosted/docker-compose.hosted.yml", [
    "${MODELFAUCET_API_IMAGE:?MODELFAUCET_API_IMAGE digest reference is required}",
    "${MODELFAUCET_GATEWAY_IMAGE:?MODELFAUCET_GATEWAY_IMAGE digest reference is required}",
    "${MODELFAUCET_DASHBOARD_IMAGE:?MODELFAUCET_DASHBOARD_IMAGE digest reference is required}",
    "redis:7.4.9-bookworm",
    "ghcr.io/berriai/litellm:v1.93.0",
    'SERVICE_PACKAGE: "@modelfaucet/api"',
    'SERVICE_PACKAGE: "@modelfaucet/gateway"',
    'SERVICE_PACKAGE: "@modelfaucet/dashboard"',
    "MODELFAUCET_API_BASE_URL: ${API_PUBLIC_BASE_URL:?API_PUBLIC_BASE_URL is required}",
    "MODELFAUCET_PUBLIC_APP_ID: ${DASHBOARD_PUBLIC_APP_ID:?DASHBOARD_PUBLIC_APP_ID is required}",
    "GATEWAY_PLATFORM_MODEL: ${GATEWAY_PLATFORM_MODEL:?GATEWAY_PLATFORM_MODEL is required}",
    "GATEWAY_PLATFORM_INPUT_PRICE_PER_1M_TOKENS_USD",
    "GATEWAY_PLATFORM_OUTPUT_PRICE_PER_1M_TOKENS_USD",
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
  assert(
    !hostedCompose.includes("VITE_MODELFAUCET_API_BASE_URL"),
    "Hosted dashboard must use runtime MODELFAUCET_API_BASE_URL instead of a Vite build-time variable."
  );
  assert(
    !hostedCompose.includes(":latest}"),
    "Hosted ModelFaucet images must not fall back to the floating latest tag."
  );
  assert(
    !hostedCompose.includes("MODELFAUCET_IMAGE_TAG"),
    "Hosted ModelFaucet images must use full name@sha256 references instead of tags."
  );
  assert(
    !hostedCompose.includes("main-latest"),
    "Hosted dependencies must not use floating main-latest tags."
  );
  assert(
    !hostedCompose.includes('command: ["pnpm", "--filter"'),
    "Hosted services must use the runtime image entrypoint instead of a workspace command."
  );

  console.log("Container publishing verification passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
