import { pathToFileURL } from "node:url";
import { loadGatewayEnv } from "./env";
import { LiteLlmClient } from "./litellm";
import { createGatewayRateLimiter } from "./rateLimit";
import { PostgresMockCompletionRepository } from "./repositories/mockCompletionRepository";
import { buildGatewayServer } from "./server";

export * from "./crypto";
export * from "./env";
export * from "./litellm";
export * from "./rateLimit";
export * from "./repositories/mockCompletionRepository";
export * from "./secretEncryption";
export * from "./server";

export async function startGatewayServer(): Promise<void> {
  const env = loadGatewayEnv();
  const liteLlmClient = new LiteLlmClient({
    baseUrl: env.liteLlmBaseUrl,
    masterKey: env.liteLlmMasterKey,
    timeoutMs: env.providerTimeoutMs,
    maxRetries: env.providerMaxRetries,
    retryDelayMs: env.providerRetryDelayMs
  });
  const mockCompletionRepository = new PostgresMockCompletionRepository(
    {
      connectionString: env.databaseUrl
    },
    liteLlmClient,
    {
      secretEncryptionKey: env.secretEncryptionKey,
      platformOnly: env.platformOnly,
      billingPolicy: {
        platformModel: env.platformModel,
        inputPricePer1mTokensUsd: env.platformInputPricePer1mTokensUsd,
        outputPricePer1mTokensUsd: env.platformOutputPricePer1mTokensUsd,
        markupPercent: env.platformMarkupPercent,
        maxInputTokens: env.platformMaxInputTokens,
        maxOutputTokens: env.platformMaxOutputTokens,
        reservationTtlMs: env.reservationTtlMs
      }
    }
  );
  const rateLimiter = await createGatewayRateLimiter({
    redisUrl: env.redisUrl,
    maxRequests: env.rateLimitMaxRequests,
    windowMs: env.rateLimitWindowMs
  });
  const server = buildGatewayServer({
    mockCompletionRepository,
    corsOrigins: env.corsOrigins,
    rateLimiter,
    metricsToken: env.metricsToken,
    trustProxy: env.trustProxyHops === 0 ? false : env.trustProxyHops,
    logger: env.nodeEnv !== "test"
  });

  await server.listen({ port: env.port, host: "0.0.0.0" });
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  startGatewayServer().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
