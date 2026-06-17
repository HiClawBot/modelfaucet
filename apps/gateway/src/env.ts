import { isCloudSafeBaseUrl } from "@modelfaucet/shared";

export type GatewayEnv = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  liteLlmBaseUrl: string;
  liteLlmMasterKey: string;
  secretEncryptionKey: string;
  providerTimeoutMs: number;
  providerMaxRetries: number;
  providerRetryDelayMs: number;
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

export function loadGatewayEnv(source: NodeJS.ProcessEnv = process.env): GatewayEnv {
  const nodeEnv = source.NODE_ENV ?? "development";
  const liteLlmBaseUrl = source.LITELLM_BASE_URL ?? "http://localhost:4000";
  if (nodeEnv === "production" && !isCloudSafeBaseUrl(liteLlmBaseUrl)) {
    throw new Error("Production LiteLLM base URL must not point to localhost or a private LAN");
  }

  return {
    nodeEnv,
    port: parseInteger(source.PORT_GATEWAY, 3002),
    databaseUrl: requireEnv(source, "DATABASE_URL"),
    liteLlmBaseUrl,
    liteLlmMasterKey: requireEnv(source, "LITELLM_MASTER_KEY"),
    secretEncryptionKey: requireEnv(source, "SECRET_ENCRYPTION_KEY"),
    providerTimeoutMs: parseInteger(source.PROVIDER_TIMEOUT_MS, 30_000),
    providerMaxRetries: parseInteger(source.PROVIDER_MAX_RETRIES, 1),
    providerRetryDelayMs: parseInteger(source.PROVIDER_RETRY_DELAY_MS, 250),
    rateLimitMaxRequests: parseNonNegativeInteger(
      source.GATEWAY_RATE_LIMIT_MAX_REQUESTS,
      1200
    ),
    rateLimitWindowMs: parseInteger(source.GATEWAY_RATE_LIMIT_WINDOW_MS, 60_000)
  };
}
