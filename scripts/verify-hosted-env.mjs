#!/usr/bin/env node

const secretPlaceholderWords = [
  "changeme",
  "default",
  "dummy",
  "example",
  "fake",
  "placeholder",
  "replace",
  "sample"
];

const blockedSecretValues = new Set([
  "dev_32_bytes_replace_me_replace_me",
  "mf_admin_dev",
  "sk-litellm-dev-master-key",
  "sk-test-litellm-master-key"
]);

const providerKeys = [
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY"
];

const requiredVariables = [
  "NODE_ENV",
  "HOSTED_ENVIRONMENT",
  "HOSTED_SECRET_MANAGER",
  "MODELFAUCET_API_IMAGE",
  "MODELFAUCET_GATEWAY_IMAGE",
  "MODELFAUCET_DASHBOARD_IMAGE",
  "DATABASE_URL",
  "SECRET_ENCRYPTION_KEY",
  "ADMIN_TOKEN",
  "DEVELOPER_ADMIN_TOKEN",
  "REDIS_URL",
  "LITELLM_BASE_URL",
  "LITELLM_MASTER_KEY",
  "METRICS_TOKEN",
  "API_CORS_ORIGINS",
  "GATEWAY_CORS_ORIGINS",
  "GATEWAY_PLATFORM_MODEL",
  "GATEWAY_PLATFORM_INPUT_PRICE_PER_1M_TOKENS_USD",
  "GATEWAY_PLATFORM_OUTPUT_PRICE_PER_1M_TOKENS_USD",
  "GATEWAY_PLATFORM_MARKUP_PERCENT",
  "GATEWAY_PLATFORM_MAX_INPUT_TOKENS",
  "GATEWAY_PLATFORM_MAX_OUTPUT_TOKENS",
  "GATEWAY_RESERVATION_TTL_MS",
  "TRUST_PROXY_HOPS",
  "API_PLATFORM_ONLY",
  "GATEWAY_PLATFORM_ONLY",
  "API_ENABLE_STRIPE_PAYMENTS",
  "API_ENABLE_PAYOUTS",
  "API_ENABLE_PROVIDER_KEYS",
  "API_ENABLE_TEST_CREDITS",
  "API_REQUIRE_SESSION_ORIGIN",
  "API_SESSION_RATE_LIMIT_MAX_REQUESTS",
  "API_SESSION_RATE_LIMIT_WINDOW_MS",
  "API_PUBLIC_BASE_URL",
  "DASHBOARD_PUBLIC_APP_ID",
  "GATEWAY_PUBLIC_BASE_URL",
  "DASHBOARD_PUBLIC_BASE_URL",
  "PUBLIC_SUPPORT_URL",
  "SECURITY_CONTACT_EMAIL",
  "ABUSE_CONTACT_EMAIL",
  "INCIDENT_CONTACT_EMAIL"
];

function readRequired(source, key) {
  const value = source[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function hasPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  return secretPlaceholderWords.some((word) => normalized.includes(word));
}

function assertSecretShape(source, key, minimumLength = 24) {
  const value = readRequired(source, key);
  const normalized = value.trim().toLowerCase();
  if (
    value.length < minimumLength ||
    blockedSecretValues.has(normalized) ||
    hasPlaceholder(value)
  ) {
    throw new Error(
      `${key} must be a non-placeholder secret with at least ${minimumLength} characters.`
    );
  }
}

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
    withoutTrailingDot === "metadata.google.internal"
  ) {
    return true;
  }

  if (
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
  if (parts === undefined) {
    return false;
  }

  return isPrivateIpv4Parts(parts);
}

function assertHttpUrl(value, key, options = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${key} must use http or https.`);
  }

  if (options.requireCloudSafe === true && isPrivateNetworkHostname(url.hostname)) {
    throw new Error(`${key} must not point to localhost, metadata, or private-network hosts.`);
  }

  return url;
}

function assertRedisUrl(value, key) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL.`);
  }

  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error(`${key} must use redis or rediss.`);
  }

  if (url.hostname.trim() === "") {
    throw new Error(`${key} must include a hostname.`);
  }
}

function assertOriginList(value, key) {
  if (value.trim() === "*") {
    throw new Error(`${key} must not be '*'.`);
  }

  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error(`${key} must include at least one origin.`);
  }

  for (const origin of origins) {
    const url = assertHttpUrl(origin, key, { requireCloudSafe: true });
    if (url.origin !== origin) {
      throw new Error(`${key} contains a non-origin URL: ${origin}`);
    }
  }
}

function assertEmail(value, key) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    throw new Error(`${key} must be an email address.`);
  }
}

function assertPublicAppId(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("DASHBOARD_PUBLIC_APP_ID contains unsupported characters.");
  }
}

function assertImageDigest(value, key, imageName) {
  const expectedPrefix = `${imageName}@sha256:`;
  if (
    !value.startsWith(expectedPrefix) ||
    !/^[0-9a-f]{64}$/.test(value.slice(expectedPrefix.length))
  ) {
    throw new Error(`${key} must be ${imageName}@sha256:<64 lowercase hex characters>.`);
  }
}

function assertMoney(value, key) {
  if (!/^(0|[1-9]\d*)(\.\d{1,8})?$/.test(value) || Number(value) <= 0) {
    throw new Error(`${key} must be a positive USD amount with at most 8 decimals.`);
  }
}

function assertPositiveInteger(value, key) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
}

function assertNonNegativeNumber(value, key) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number.`);
  }
}

function assertOptionalSecretGroup(source, enabledKey, keys) {
  if (source[enabledKey] !== "1") {
    return false;
  }

  const missing = keys.filter((key) => source[key] === undefined || source[key]?.trim() === "");
  if (missing.length > 0) {
    throw new Error(`${enabledKey}=1 requires ${missing.join(", ")}.`);
  }

  return true;
}

function assertOptionalAnySecret(source, enabledKey, keys) {
  if (source[enabledKey] !== "1") {
    return false;
  }

  const present = keys.some((key) => {
    const value = source[key];
    return value !== undefined && value.trim() !== "" && !hasPlaceholder(value);
  });
  if (!present) {
    throw new Error(`${enabledKey}=1 requires at least one of ${keys.join(", ")}.`);
  }

  return true;
}

function main(source = process.env) {
  for (const key of requiredVariables) {
    readRequired(source, key);
  }

  if (readRequired(source, "NODE_ENV") !== "production") {
    throw new Error("NODE_ENV must be production for hosted beta verification.");
  }

  assertSecretShape(source, "SECRET_ENCRYPTION_KEY", 32);
  assertSecretShape(source, "ADMIN_TOKEN", 24);
  assertSecretShape(source, "DEVELOPER_ADMIN_TOKEN", 24);
  assertSecretShape(source, "LITELLM_MASTER_KEY", 24);
  assertSecretShape(source, "METRICS_TOKEN", 24);

  assertRedisUrl(readRequired(source, "REDIS_URL"), "REDIS_URL");
  assertHttpUrl(readRequired(source, "LITELLM_BASE_URL"), "LITELLM_BASE_URL", {
    requireCloudSafe: true
  });
  assertHttpUrl(readRequired(source, "API_PUBLIC_BASE_URL"), "API_PUBLIC_BASE_URL", {
    requireCloudSafe: true
  });
  assertHttpUrl(readRequired(source, "GATEWAY_PUBLIC_BASE_URL"), "GATEWAY_PUBLIC_BASE_URL", {
    requireCloudSafe: true
  });
  assertHttpUrl(readRequired(source, "DASHBOARD_PUBLIC_BASE_URL"), "DASHBOARD_PUBLIC_BASE_URL", {
    requireCloudSafe: true
  });
  assertHttpUrl(readRequired(source, "PUBLIC_SUPPORT_URL"), "PUBLIC_SUPPORT_URL", {
    requireCloudSafe: true
  });
  assertPublicAppId(readRequired(source, "DASHBOARD_PUBLIC_APP_ID"));
  assertImageDigest(
    readRequired(source, "MODELFAUCET_API_IMAGE"),
    "MODELFAUCET_API_IMAGE",
    "ghcr.io/hiclawbot/modelfaucet-api"
  );
  assertImageDigest(
    readRequired(source, "MODELFAUCET_GATEWAY_IMAGE"),
    "MODELFAUCET_GATEWAY_IMAGE",
    "ghcr.io/hiclawbot/modelfaucet-gateway"
  );
  assertImageDigest(
    readRequired(source, "MODELFAUCET_DASHBOARD_IMAGE"),
    "MODELFAUCET_DASHBOARD_IMAGE",
    "ghcr.io/hiclawbot/modelfaucet-dashboard"
  );
  if (!/^[A-Za-z0-9_.:/-]+$/.test(readRequired(source, "GATEWAY_PLATFORM_MODEL"))) {
    throw new Error("GATEWAY_PLATFORM_MODEL contains unsupported characters.");
  }
  assertMoney(
    readRequired(source, "GATEWAY_PLATFORM_INPUT_PRICE_PER_1M_TOKENS_USD"),
    "GATEWAY_PLATFORM_INPUT_PRICE_PER_1M_TOKENS_USD"
  );
  assertMoney(
    readRequired(source, "GATEWAY_PLATFORM_OUTPUT_PRICE_PER_1M_TOKENS_USD"),
    "GATEWAY_PLATFORM_OUTPUT_PRICE_PER_1M_TOKENS_USD"
  );
  assertNonNegativeNumber(
    readRequired(source, "GATEWAY_PLATFORM_MARKUP_PERCENT"),
    "GATEWAY_PLATFORM_MARKUP_PERCENT"
  );
  assertPositiveInteger(
    readRequired(source, "GATEWAY_PLATFORM_MAX_INPUT_TOKENS"),
    "GATEWAY_PLATFORM_MAX_INPUT_TOKENS"
  );
  assertPositiveInteger(
    readRequired(source, "GATEWAY_PLATFORM_MAX_OUTPUT_TOKENS"),
    "GATEWAY_PLATFORM_MAX_OUTPUT_TOKENS"
  );
  assertPositiveInteger(
    readRequired(source, "GATEWAY_RESERVATION_TTL_MS"),
    "GATEWAY_RESERVATION_TTL_MS"
  );
  assertPositiveInteger(readRequired(source, "TRUST_PROXY_HOPS"), "TRUST_PROXY_HOPS");
  assertPositiveInteger(
    readRequired(source, "API_SESSION_RATE_LIMIT_MAX_REQUESTS"),
    "API_SESSION_RATE_LIMIT_MAX_REQUESTS"
  );
  assertPositiveInteger(
    readRequired(source, "API_SESSION_RATE_LIMIT_WINDOW_MS"),
    "API_SESSION_RATE_LIMIT_WINDOW_MS"
  );

  for (const key of ["API_PLATFORM_ONLY", "GATEWAY_PLATFORM_ONLY", "API_REQUIRE_SESSION_ORIGIN"]) {
    if (readRequired(source, key) !== "1") {
      throw new Error(`${key} must be '1' for the first hosted Beta.`);
    }
  }
  for (const key of [
    "API_ENABLE_STRIPE_PAYMENTS",
    "API_ENABLE_PAYOUTS",
    "API_ENABLE_PROVIDER_KEYS",
    "API_ENABLE_TEST_CREDITS"
  ]) {
    if (readRequired(source, key) !== "0") {
      throw new Error(`${key} must be '0' for the first hosted Beta.`);
    }
  }

  assertOriginList(readRequired(source, "API_CORS_ORIGINS"), "API_CORS_ORIGINS");
  assertOriginList(readRequired(source, "GATEWAY_CORS_ORIGINS"), "GATEWAY_CORS_ORIGINS");

  assertEmail(readRequired(source, "SECURITY_CONTACT_EMAIL"), "SECURITY_CONTACT_EMAIL");
  assertEmail(readRequired(source, "ABUSE_CONTACT_EMAIL"), "ABUSE_CONTACT_EMAIL");
  assertEmail(readRequired(source, "INCIDENT_CONTACT_EMAIL"), "INCIDENT_CONTACT_EMAIL");

  const providerStrict = assertOptionalAnySecret(source, "REQUIRE_HOSTED_PROVIDER", providerKeys);
  const stripeStrict = assertOptionalSecretGroup(source, "REQUIRE_HOSTED_STRIPE", [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET"
  ]);

  console.log("Hosted environment verification passed.");
  console.log(
    `Checked ${requiredVariables.length} required variables without printing secret values.`
  );
  console.log(
    providerStrict
      ? "Provider key presence check: enforced."
      : "Provider key presence check: skipped; set REQUIRE_HOSTED_PROVIDER=1 before real provider pilot traffic."
  );
  console.log(
    stripeStrict
      ? "Stripe secret presence check: enforced."
      : "Stripe secret presence check: skipped; set REQUIRE_HOSTED_STRIPE=1 before Stripe pilot traffic."
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
