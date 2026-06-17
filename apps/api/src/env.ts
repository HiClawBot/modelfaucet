export type ApiEnv = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  gatewayBaseUrl: string;
  sessionTokenTtlSeconds: number;
  secretEncryptionKey: string;
  developerAdminToken: string;
  adminToken: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  payoutThresholdUsd: string;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
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

export function loadApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return {
    nodeEnv: source.NODE_ENV ?? "development",
    port: parseInteger(source.PORT_API, 3001),
    databaseUrl: requireEnv(source, "DATABASE_URL"),
    gatewayBaseUrl: source.GATEWAY_BASE_URL ?? "http://localhost:3002/v1",
    sessionTokenTtlSeconds: parseInteger(source.SESSION_TOKEN_TTL_SECONDS, 3600),
    secretEncryptionKey: requireEnv(source, "SECRET_ENCRYPTION_KEY"),
    developerAdminToken: source.DEVELOPER_ADMIN_TOKEN ?? "mf_admin_dev",
    adminToken: source.ADMIN_TOKEN ?? source.DEVELOPER_ADMIN_TOKEN ?? "mf_admin_dev",
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
    rateLimitMaxRequests: parseNonNegativeInteger(
      source.API_RATE_LIMIT_MAX_REQUESTS,
      1200
    ),
    rateLimitWindowMs: parseInteger(source.API_RATE_LIMIT_WINDOW_MS, 60_000)
  };
}
