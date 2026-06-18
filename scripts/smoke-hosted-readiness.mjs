#!/usr/bin/env node

const apiBaseUrl = process.env.MODELFAUCET_API_BASE_URL;
const gatewayBaseUrl = process.env.MODELFAUCET_GATEWAY_BASE_URL;

function isPrivateIpv4Parts(parts) {
  const [first = -1, second = -1] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function parseIpv4Parts(hostname) {
  const octets = hostname.split(".");
  if (octets.length !== 4) {
    return undefined;
  }

  const parts = octets.map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return undefined;
  }

  return parts;
}

function parseIpv4MappedIpv6Parts(hostname) {
  if (!hostname.startsWith("::ffff:")) {
    return undefined;
  }

  const suffix = hostname.slice("::ffff:".length);
  const dottedParts = parseIpv4Parts(suffix);
  if (dottedParts !== undefined) {
    return dottedParts;
  }

  const groups = suffix.split(":");
  if (groups.length !== 2) {
    return undefined;
  }

  const high = Number.parseInt(groups[0] ?? "", 16);
  const low = Number.parseInt(groups[1] ?? "", 16);
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return undefined;
  }

  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isPrivateNetworkHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const withoutTrailingDot = normalized.replace(/\.$/, "");

  if (
    withoutTrailingDot === "localhost" ||
    withoutTrailingDot.endsWith(".localhost") ||
    withoutTrailingDot === "metadata" ||
    withoutTrailingDot === "metadata.google.internal" ||
    normalized === "::" ||
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

  const mappedParts = parseIpv4MappedIpv6Parts(normalized);
  if (mappedParts !== undefined) {
    return isPrivateIpv4Parts(mappedParts);
  }

  const parts = parseIpv4Parts(normalized);
  return parts !== undefined && isPrivateIpv4Parts(parts);
}

function readBaseUrl(value, key) {
  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }

  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${key} must use http or https.`);
  }

  if (process.env.ALLOW_PRIVATE_HOSTED_SMOKE !== "1" && isPrivateNetworkHostname(url.hostname)) {
    throw new Error(
      `${key} must not target localhost or private networks unless ALLOW_PRIVATE_HOSTED_SMOKE=1.`
    );
  }

  return url;
}

function resolveServiceUrl(baseUrl, path) {
  const serviceBase = new URL(baseUrl);
  if (serviceBase.pathname.endsWith("/v1")) {
    serviceBase.pathname = serviceBase.pathname.slice(0, -"/v1".length);
  }

  if (!serviceBase.pathname.endsWith("/")) {
    serviceBase.pathname = `${serviceBase.pathname}/`;
  }

  return new URL(path.replace(/^\//, ""), serviceBase);
}

async function readText(url) {
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  return body;
}

async function readJson(url) {
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  return JSON.parse(body);
}

try {
  const apiUrl = readBaseUrl(apiBaseUrl, "MODELFAUCET_API_BASE_URL");
  const gatewayUrl = readBaseUrl(gatewayBaseUrl, "MODELFAUCET_GATEWAY_BASE_URL");

  const apiReady = resolveServiceUrl(apiUrl, "/ready");
  const apiMetrics = resolveServiceUrl(apiUrl, "/metrics");
  const gatewayReady = resolveServiceUrl(gatewayUrl, "/ready");
  const providerHealth = resolveServiceUrl(gatewayUrl, "/health/providers");

  await readJson(apiReady);
  console.log(`PASS API readiness: ${apiReady}`);

  const metrics = await readText(apiMetrics);
  if (!metrics.includes("modelfaucet_http_requests_total")) {
    throw new Error("API metrics response did not include modelfaucet_http_requests_total.");
  }
  console.log(`PASS API metrics: ${apiMetrics}`);

  await readJson(gatewayReady);
  console.log(`PASS Gateway readiness: ${gatewayReady}`);

  const health = await readJson(providerHealth);
  if (!Array.isArray(health.providers)) {
    throw new Error("Gateway provider health response did not include providers array.");
  }
  console.log(`PASS Gateway provider health: ${providerHealth}`);

  console.log("Hosted readiness smoke passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
