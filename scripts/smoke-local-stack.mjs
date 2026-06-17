#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { startMockOpenAiCompatibleServer } from "./mock-openai-compatible.mjs";

const repoRoot = new URL("..", import.meta.url);
const databaseUrl = process.env.DATABASE_URL;
const apiPort = Number(process.env.SMOKE_API_PORT ?? "3101");
const gatewayPort = Number(process.env.SMOKE_GATEWAY_PORT ?? "3102");
const providerPort = Number(process.env.SMOKE_PROVIDER_PORT ?? "4100");
const providerMode = process.env.SMOKE_PROVIDER_MODE ?? "mock";
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}/v1`;
const mockProviderBaseUrl = `http://127.0.0.1:${providerPort}`;

function assertRequiredEnvironment() {
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required for the local stack smoke test.");
  }

  if (providerMode !== "mock" && providerMode !== "external") {
    throw new Error("SMOKE_PROVIDER_MODE must be either 'mock' or 'external'.");
  }
}

function isPrivateNetworkHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  if (
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  const octets = normalized.split(".");
  if (octets.length !== 4) {
    return false;
  }

  const parts = octets.map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first = -1, second = -1] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function assertExternalProviderBaseUrl(value) {
  if (value === undefined || value.trim() === "") {
    throw new Error("LITELLM_BASE_URL is required when SMOKE_PROVIDER_MODE=external.");
  }

  const url = new URL(value);
  if (isPrivateNetworkHostname(url.hostname) && process.env.SMOKE_ALLOW_PRIVATE_PROVIDER !== "1") {
    throw new Error(
      "External provider smoke refuses localhost/private LITELLM_BASE_URL without SMOKE_ALLOW_PRIVATE_PROVIDER=1."
    );
  }
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`
    );
  }

  return result.stdout.trim();
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function queryScalar(query) {
  return run("psql", [
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    databaseUrl,
    "-At",
    "-c",
    query
  ]);
}

function startService(name, filter, env) {
  const child = spawn("pnpm", ["--filter", filter, "dev"], {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      output.push(`${name} exited with code ${code}\n`);
    }
    if (signal !== null) {
      output.push(`${name} exited with signal ${signal}\n`);
    }
  });

  return {
    name,
    child,
    logs() {
      return output.join("").slice(-4000);
    }
  };
}

async function stopService(service) {
  if (service.child.exitCode !== null || service.child.signalCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    service.child.once("exit", finish);

    if (service.child.pid === undefined) {
      service.child.kill("SIGTERM");
    } else {
      try {
        process.kill(-service.child.pid, "SIGTERM");
      } catch {
        service.child.kill("SIGTERM");
      }
    }

    setTimeout(() => {
      if (settled) {
        return;
      }

      if (service.child.pid !== undefined) {
        try {
          process.kill(-service.child.pid, "SIGKILL");
        } catch {
          service.child.kill("SIGKILL");
        }
      } else {
        service.child.kill("SIGKILL");
      }
      finish();
    }, 2_000).unref();
  });
}

async function waitForHealth(url, service, started) {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    if (started.child.exitCode !== null) {
      throw new Error(`${service} exited before becoming healthy:\n${started.logs()}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${service} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(
    `${service} did not become healthy at ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\n${started.logs()}`
  );
}

async function readJson(response) {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function cleanup(startedServices, mockProvider) {
  for (const service of startedServices.reverse()) {
    await stopService(service);
  }

  if (mockProvider !== undefined) {
    mockProvider.closeAllConnections?.();
    await new Promise((resolve) => {
      mockProvider.close(resolve);
    });
  }
}

async function main() {
  assertRequiredEnvironment();

  console.log("Preparing database schema and seed data...");
  run("pnpm", ["db:migrate"]);
  run("pnpm", ["db:seed"]);

  const externalProviderBaseUrl = process.env.LITELLM_BASE_URL;
  if (providerMode === "external") {
    assertExternalProviderBaseUrl(externalProviderBaseUrl);
  }

  const mockProvider =
    providerMode === "mock"
      ? await startMockOpenAiCompatibleServer({
          host: "127.0.0.1",
          port: providerPort
        })
      : undefined;
  const childEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    SECRET_ENCRYPTION_KEY:
      process.env.SECRET_ENCRYPTION_KEY ?? "dev_32_bytes_replace_me_replace_me",
    LITELLM_MASTER_KEY: process.env.LITELLM_MASTER_KEY ?? "sk-test-litellm-master-key",
    LITELLM_BASE_URL:
      providerMode === "mock" ? mockProviderBaseUrl : String(externalProviderBaseUrl),
    PORT_API: String(apiPort),
    PORT_GATEWAY: String(gatewayPort),
    GATEWAY_BASE_URL: gatewayBaseUrl
  };
  const startedServices = [
    startService("api", "@modelfaucet/api", childEnv),
    startService("gateway", "@modelfaucet/gateway", childEnv)
  ];

  try {
    await waitForHealth(`${apiBaseUrl}/health`, "api", startedServices[0]);
    await waitForHealth(`http://127.0.0.1:${gatewayPort}/health`, "gateway", startedServices[1]);

    const providerHealth = await readJson(
      await fetch(`http://127.0.0.1:${gatewayPort}/health/providers`)
    );
    if (providerHealth.ok !== true) {
      throw new Error(`Provider health check failed: ${JSON.stringify(providerHealth)}`);
    }

    const session = await readJson(
      await fetch(`${apiBaseUrl}/v1/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          public_app_id: "app_pub_demo",
          external_user_id: "crm-demo-user",
          feature_key: "customer_reply"
        })
      })
    );

    const wallet = await readJson(
      await fetch(`${apiBaseUrl}/v1/user/wallet`, {
        headers: {
          authorization: `Bearer ${session.session_token}`
        }
      })
    );

    if (Number(wallet.balance_usd) <= 0) {
      throw new Error(`Expected seeded wallet balance, received ${wallet.balance_usd}`);
    }

    const completion = await readJson(
      await fetch(`${gatewayBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.session_token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "auto:customer_reply",
          messages: [
            {
              role: "user",
              content: "Draft a concise reply for a delayed shipment support ticket."
            }
          ],
          metadata: {
            feature_key: "customer_reply"
          }
        })
      })
    );

    const requestId = completion.modelfaucet?.request_id;
    if (typeof requestId !== "string" || requestId.length === 0) {
      throw new Error("Gateway response did not include a ModelFaucet request id.");
    }

    const ledgerCount = Number(
      queryScalar(`
        select count(*)
        from ledger_entries
        where usage_event_id = (
          select id from usage_events where request_id = ${sqlString(requestId)}
        )
      `)
    );
    if (ledgerCount < 4) {
      throw new Error(`Expected at least 4 ledger entries, found ${ledgerCount}.`);
    }

    const usage = await readJson(
      await fetch(`${apiBaseUrl}/v1/apps/app_pub_demo/usage`)
    );
    const usageRows = Array.isArray(usage.usage) ? usage.usage : [];
    if (!usageRows.some((row) => row.request_id === requestId)) {
      throw new Error(`Dashboard usage did not include request ${requestId}.`);
    }

    console.log(
      `Smoke test passed: request ${requestId}, route ${completion.modelfaucet.route_mode}, ledger entries ${ledgerCount}.`
    );
  } finally {
    await cleanup(startedServices, mockProvider);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
