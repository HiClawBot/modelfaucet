#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = new URL("..", import.meta.url);
const port = Number(process.env.SMOKE_DASHBOARD_PORT ?? "3393");
const apiBaseUrl = "https://api.runtime-config.invalid";
const publicAppId = "app_runtime_config";

const child = spawn("pnpm", ["--filter", "@modelfaucet/dashboard", "start"], {
  cwd: repoRoot,
  detached: true,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT_DASHBOARD: String(port),
    MODELFAUCET_API_BASE_URL: apiBaseUrl,
    MODELFAUCET_PUBLIC_APP_ID: publicAppId
  },
  stdio: ["ignore", "pipe", "pipe"]
});
const logs = [];
child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

async function stop() {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  if (child.pid !== undefined) {
    process.kill(-child.pid, "SIGTERM");
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(2_000)
  ]);
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Dashboard exited before startup:\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/config.js`);
      if (response.ok) {
        return response;
      }
    } catch {
      // The server may still be starting.
    }
    await delay(200);
  }
  throw new Error(`Dashboard did not start:\n${logs.join("")}`);
}

try {
  const configResponse = await waitForServer();
  const configBody = await configResponse.text();
  if (!configBody.includes(JSON.stringify(apiBaseUrl)) || !configBody.includes(publicAppId)) {
    throw new Error(`Runtime config did not include the requested values: ${configBody}`);
  }
  if (configResponse.headers.get("cache-control") !== "no-store") {
    throw new Error("Runtime config must be served with cache-control: no-store.");
  }

  const routeResponse = await fetch(
    `http://127.0.0.1:${port}/apps/${publicAppId}/usage`
  );
  if (!routeResponse.ok || !(await routeResponse.text()).includes("id=\"root\"")) {
    throw new Error("Dashboard SPA fallback did not return the built index.");
  }
  if (!routeResponse.headers.get("content-security-policy")?.includes(apiBaseUrl)) {
    throw new Error("Dashboard CSP did not include the configured API origin.");
  }

  const assetNames = await readdir(new URL("../apps/dashboard/dist/assets/", import.meta.url));
  const javascriptAssets = assetNames.filter((name) => name.endsWith(".js"));
  const javascript = (
    await Promise.all(
      javascriptAssets.map((name) =>
        readFile(new URL(`../apps/dashboard/dist/assets/${name}`, import.meta.url), "utf8")
      )
    )
  ).join("\n");
  if (javascript.includes("http://localhost:3201")) {
    throw new Error("Production dashboard bundle still contains the localhost API fallback.");
  }

  console.log("Dashboard runtime configuration smoke test passed.");
} finally {
  await stop();
}
