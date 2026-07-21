#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(appDirectory, "dist");
const port = Number(process.env.PORT_DASHBOARD ?? "3203");
const nodeEnv = process.env.NODE_ENV ?? "development";

function requireRuntimeValue(name, fallback = "") {
  const value = process.env[name]?.trim() ?? fallback;
  if (nodeEnv === "production" && value.length === 0) {
    throw new Error(`${name} is required in production.`);
  }
  return value;
}

function readApiBaseUrl() {
  const value = requireRuntimeValue(
    "MODELFAUCET_API_BASE_URL",
    nodeEnv === "production" ? "" : "http://localhost:3201"
  );
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("MODELFAUCET_API_BASE_URL must use http or https.");
  }
  if (
    nodeEnv === "production" &&
    url.protocol !== "https:" &&
    process.env.DASHBOARD_ALLOW_INSECURE_API !== "1"
  ) {
    throw new Error(
      "MODELFAUCET_API_BASE_URL must use https in production unless DASHBOARD_ALLOW_INSECURE_API=1."
    );
  }
  return url.toString().replace(/\/$/, "");
}

function readPublicAppId() {
  const value = requireRuntimeValue(
    "MODELFAUCET_PUBLIC_APP_ID",
    nodeEnv === "production" ? "" : "app_pub_demo"
  );
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("MODELFAUCET_PUBLIC_APP_ID contains unsupported characters.");
  }
  return value;
}

const apiBaseUrl = readApiBaseUrl();
const publicAppId = readPublicAppId();
const apiOrigin = new URL(apiBaseUrl).origin;
const runtimeConfig = JSON.stringify({ apiBaseUrl, publicAppId }).replaceAll("<", "\\u003c");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

function setSecurityHeaders(response) {
  response.setHeader("content-security-policy", [
    "default-src 'self'",
    "base-uri 'none'",
    `connect-src 'self' ${apiOrigin}`,
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'"
  ].join("; "));
  response.setHeader("cross-origin-opener-policy", "same-origin");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
}

async function findStaticFile(pathname) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname).slice(1);
  const requestedPath = resolve(distDirectory, requested);
  if (requestedPath !== distDirectory && !requestedPath.startsWith(`${distDirectory}${sep}`)) {
    return undefined;
  }

  try {
    if ((await stat(requestedPath)).isFile()) {
      return requestedPath;
    }
  } catch {
    // Extensionless dashboard routes use the SPA entry below.
  }

  if (extname(requested) === "") {
    return resolve(distDirectory, "index.html");
  }
  return undefined;
}

await stat(resolve(distDirectory, "index.html"));

async function handleRequest(request, response) {
  setSecurityHeaders(response);
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  const pathname = new URL(request.url ?? "/", "http://dashboard.local").pathname;
  if (pathname === "/config.js") {
    const body = `window.MODELFAUCET_CONFIG = ${runtimeConfig};\n`;
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/javascript; charset=utf-8"
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }

  const filePath = await findStaticFile(pathname);
  if (filePath === undefined) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : "Not found\n");
    return;
  }

  const isIndex = filePath.endsWith(`${sep}index.html`);
  response.writeHead(200, {
    "cache-control": isIndex ? "no-cache" : "public, max-age=31536000, immutable",
    "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    console.error(error);
    if (response.headersSent) {
      response.destroy();
      return;
    }
    setSecurityHeaders(response);
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid request\n");
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`ModelFaucet Dashboard listening on http://0.0.0.0:${port}`);
});

function shutdown() {
  server.close((error) => {
    if (error !== undefined) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
