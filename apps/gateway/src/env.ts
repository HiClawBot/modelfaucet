import { isCloudSafeBaseUrl, parseMoneyToUnits } from "@modelfaucet/shared";

export type GatewayEnv = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  liteLlmBaseUrl: string;
  liteLlmMasterKey: string;
  corsOrigins: true | string[];
  secretEncryptionKey: string;
  providerTimeoutMs: number;
  providerMaxRetries: number;
  providerRetryDelayMs: number;
  redisUrl?: string;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  platformModel: string;
  platformInputPricePer1mTokensUsd: string;
  platformOutputPricePer1mTokensUsd: string;
  platformMarkupPercent: number;
  platformMaxInputTokens: number;
  platformMaxOutputTokens: number;
  reservationTtlMs: number;
  metricsToken?: string;
  trustProxyHops: number;
  platformOnly: boolean;
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

function parseMoney(value: string, key: string): string {
  try {
    if (parseMoneyToUnits(value) <= 0n) {
      throw new Error("not positive");
    }
    return value;
  } catch {
    throw new Error(`${key} must be a positive USD amount with at most 8 decimals.`);
  }
}

function parseNonNegativeNumber(value: string, key: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number.`);
  }
  return parsed;
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

export function loadGatewayEnv(source: NodeJS.ProcessEnv = process.env): GatewayEnv {
  const nodeEnv = source.NODE_ENV ?? "development";
  const redisUrl =
    nodeEnv === "production"
      ? productionValue(source, nodeEnv, "REDIS_URL", "")
      : source.REDIS_URL?.trim() || undefined;
  const liteLlmBaseUrl = source.LITELLM_BASE_URL ?? "http://localhost:3205";
  if (nodeEnv === "production" && !isCloudSafeBaseUrl(liteLlmBaseUrl)) {
    throw new Error("Production LiteLLM base URL must not point to localhost or a private LAN");
  }

  const platformModel = productionValue(
    source,
    nodeEnv,
    "GATEWAY_PLATFORM_MODEL",
    "auto-text"
  );
  if (!/^[A-Za-z0-9_.:/-]+$/.test(platformModel)) {
    throw new Error("GATEWAY_PLATFORM_MODEL contains unsupported characters.");
  }
  const inputPrice = productionValue(
    source,
    nodeEnv,
    "GATEWAY_PLATFORM_INPUT_PRICE_PER_1M_TOKENS_USD",
    "1.00000000"
  );
  const outputPrice = productionValue(
    source,
    nodeEnv,
    "GATEWAY_PLATFORM_OUTPUT_PRICE_PER_1M_TOKENS_USD",
    "2.00000000"
  );
  const markup = productionValue(
    source,
    nodeEnv,
    "GATEWAY_PLATFORM_MARKUP_PERCENT",
    "30"
  );
  const maxInputTokens = productionValue(
    source,
    nodeEnv,
    "GATEWAY_PLATFORM_MAX_INPUT_TOKENS",
    "8192"
  );
  const maxOutputTokens = productionValue(
    source,
    nodeEnv,
    "GATEWAY_PLATFORM_MAX_OUTPUT_TOKENS",
    "1024"
  );
  const reservationTtlMs = productionValue(
    source,
    nodeEnv,
    "GATEWAY_RESERVATION_TTL_MS",
    "120000"
  );

  return {
    nodeEnv,
    port: parseInteger(source.PORT_GATEWAY, 3202),
    databaseUrl: requireEnv(source, "DATABASE_URL"),
    liteLlmBaseUrl,
    liteLlmMasterKey: requireEnv(source, "LITELLM_MASTER_KEY"),
    corsOrigins: parseCorsOrigins(
      source.GATEWAY_CORS_ORIGINS,
      nodeEnv,
      "GATEWAY_CORS_ORIGINS"
    ),
    secretEncryptionKey: requireEnv(source, "SECRET_ENCRYPTION_KEY"),
    providerTimeoutMs: parseInteger(source.PROVIDER_TIMEOUT_MS, 30_000),
    providerMaxRetries: parseInteger(source.PROVIDER_MAX_RETRIES, 1),
    providerRetryDelayMs: parseInteger(source.PROVIDER_RETRY_DELAY_MS, 250),
    redisUrl,
    rateLimitMaxRequests: parseNonNegativeInteger(
      source.GATEWAY_RATE_LIMIT_MAX_REQUESTS,
      1200
    ),
    rateLimitWindowMs: parseInteger(source.GATEWAY_RATE_LIMIT_WINDOW_MS, 60_000),
    platformModel,
    platformInputPricePer1mTokensUsd: parseMoney(
      inputPrice,
      "GATEWAY_PLATFORM_INPUT_PRICE_PER_1M_TOKENS_USD"
    ),
    platformOutputPricePer1mTokensUsd: parseMoney(
      outputPrice,
      "GATEWAY_PLATFORM_OUTPUT_PRICE_PER_1M_TOKENS_USD"
    ),
    platformMarkupPercent: parseNonNegativeNumber(
      markup,
      "GATEWAY_PLATFORM_MARKUP_PERCENT"
    ),
    platformMaxInputTokens: parseInteger(maxInputTokens, 8192),
    platformMaxOutputTokens: parseInteger(maxOutputTokens, 1024),
    reservationTtlMs: parseInteger(reservationTtlMs, 120_000),
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
        ? productionValue(source, nodeEnv, "GATEWAY_PLATFORM_ONLY", "1")
        : source.GATEWAY_PLATFORM_ONLY ?? "0",
      "GATEWAY_PLATFORM_ONLY"
    )
  };
}
