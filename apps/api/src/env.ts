export type ApiEnv = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  gatewayBaseUrl: string;
  corsOrigins: true | string[];
  sessionTokenTtlSeconds: number;
  secretEncryptionKey: string;
  developerAdminToken: string;
  adminToken: string;
  metricsToken?: string;
  trustProxyHops: number;
  platformOnly: boolean;
  enableStripePayments: boolean;
  enablePayouts: boolean;
  enableProviderKeys: boolean;
  enableTestCredits: boolean;
  requireSessionOrigin: boolean;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  payoutThresholdUsd: string;
  redisUrl?: string;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  sessionRateLimitMaxRequests: number;
  sessionRateLimitWindowMs: number;
};

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, got ${value}`);
  }

  return parsed;
}

function requireEnv(source: NodeJS.ProcessEnv, key: string): string {
  const value = source[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable ${key}`);
  }

  return value;
}

function productionValue(
  source: NodeJS.ProcessEnv,
  nodeEnv: string,
  key: string,
  developmentFallback: string
): string {
  const value = source[key]?.trim();
  if (value !== undefined && value !== "") {
    return value;
  }
  if (nodeEnv === "production") {
    throw new Error(`${key} is required in production.`);
  }
  return developmentFallback;
}

function parseFlag(value: string, key: string): boolean {
  if (value === "1") {
    return true;
  }
  if (value === "0") {
    return false;
  }
  throw new Error(`${key} must be '0' or '1'.`);
}

function parseCorsOrigins(
  value: string | undefined,
  nodeEnv: string,
  key: string
): true | string[] {
  if (value === undefined || value.trim() === "") {
    if (nodeEnv === "production") {
      throw new Error(`${key} is required in production.`);
    }

    return true;
  }

  if (value.trim() === "*") {
    if (nodeEnv === "production") {
      throw new Error(`${key} must not be '*' in production.`);
    }

    return true;
  }

  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error(`${key} must include at least one origin.`);
  }

  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.origin !== origin || (url.protocol !== "https:" && url.protocol !== "http:")) {
        throw new Error("invalid origin");
      }
    } catch {
      throw new Error(`${key} contains an invalid origin: ${origin}`);
    }
  }

  return origins;
}

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const nodeEnv = source.NODE_ENV ?? "development";
  const developerAdminToken = productionValue(
    source,
    nodeEnv,
    "DEVELOPER_ADMIN_TOKEN",
    "mf_admin_dev"
  );
  const redisUrl =
    nodeEnv === "production"
      ? productionValue(source, nodeEnv, "REDIS_URL", "")
      : source.REDIS_URL?.trim() || undefined;
  return {
    nodeEnv,
    port: parseInteger(source.PORT_API, 3201),
    databaseUrl: requireEnv(source, "DATABASE_URL"),
    gatewayBaseUrl: source.GATEWAY_BASE_URL ?? "http://localhost:3202/v1",
    corsOrigins: parseCorsOrigins(source.API_CORS_ORIGINS, nodeEnv, "API_CORS_ORIGINS"),
    sessionTokenTtlSeconds: parseInteger(source.SESSION_TOKEN_TTL_SECONDS, 3600),
    secretEncryptionKey: requireEnv(source, "SECRET_ENCRYPTION_KEY"),
    developerAdminToken,
    adminToken: productionValue(source, nodeEnv, "ADMIN_TOKEN", developerAdminToken),
    metricsToken:
      nodeEnv === "production"
        ? productionValue(source, nodeEnv, "METRICS_TOKEN", "")
        : source.METRICS_TOKEN,
    trustProxyHops: parseNonNegativeInteger(
      nodeEnv === "production"
        ? productionValue(source, nodeEnv, "TRUST_PROXY_HOPS", "0")
        : source.TRUST_PROXY_HOPS,
      0
    ),
    platformOnly: parseFlag(
      nodeEnv === "production"
        ? productionValue(source, nodeEnv, "API_PLATFORM_ONLY", "1")
        : source.API_PLATFORM_ONLY ?? "0",
      "API_PLATFORM_ONLY"
    ),
    enableStripePayments: parseFlag(
      nodeEnv === "production"
        ? productionValue(source, nodeEnv, "API_ENABLE_STRIPE_PAYMENTS", "0")
        : source.API_ENABLE_STRIPE_PAYMENTS ?? "1",
      "API_ENABLE_STRIPE_PAYMENTS"
    ),
    enablePayouts: parseFlag(
      nodeEnv === "production"
        ? productionValue(source, nodeEnv, "API_ENABLE_PAYOUTS", "0")
        : source.API_ENABLE_PAYOUTS ?? "1",
      "API_ENABLE_PAYOUTS"
    ),
    enableProviderKeys: parseFlag(
      nodeEnv === "production"
        ? productionValue(source, nodeEnv, "API_ENABLE_PROVIDER_KEYS", "0")
        : source.API_ENABLE_PROVIDER_KEYS ?? "1",
      "API_ENABLE_PROVIDER_KEYS"
    ),
    enableTestCredits: parseFlag(
      nodeEnv === "production"
        ? productionValue(source, nodeEnv, "API_ENABLE_TEST_CREDITS", "0")
        : source.API_ENABLE_TEST_CREDITS ?? "1",
      "API_ENABLE_TEST_CREDITS"
    ),
    requireSessionOrigin: parseFlag(
      nodeEnv === "production"
        ? productionValue(source, nodeEnv, "API_REQUIRE_SESSION_ORIGIN", "1")
        : source.API_REQUIRE_SESSION_ORIGIN ?? "0",
      "API_REQUIRE_SESSION_ORIGIN"
    ),
    stripeSecretKey:
      source.STRIPE_SECRET_KEY !== undefined && source.STRIPE_SECRET_KEY.trim() !== ""
        ? source.STRIPE_SECRET_KEY
        : undefined,
    stripeWebhookSecret:
      source.STRIPE_WEBHOOK_SECRET !== undefined &&
      source.STRIPE_WEBHOOK_SECRET.trim() !== ""
        ? source.STRIPE_WEBHOOK_SECRET
        : undefined,
    payoutThresholdUsd: source.PAYOUT_THRESHOLD_USD ?? "1.00000000",
    redisUrl,
    rateLimitMaxRequests: parseNonNegativeInteger(
      source.API_RATE_LIMIT_MAX_REQUESTS,
      1200
    ),
    rateLimitWindowMs: parseInteger(source.API_RATE_LIMIT_WINDOW_MS, 60_000),
    sessionRateLimitMaxRequests: parseInteger(
      source.API_SESSION_RATE_LIMIT_MAX_REQUESTS,
      60
    ),
    sessionRateLimitWindowMs: parseInteger(
      source.API_SESSION_RATE_LIMIT_WINDOW_MS,
      60_000
    )
  };
}
