import { pathToFileURL } from "node:url";
import { InMemoryRateLimiter } from "@modelfaucet/shared";
import { loadGatewayEnv } from "./env";
import { LiteLlmClient } from "./litellm";
import { PostgresMockCompletionRepository } from "./repositories/mockCompletionRepository";
import { buildGatewayServer } from "./server";

export * from "./crypto";
export * from "./env";
export * from "./litellm";
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
      secretEncryptionKey: env.secretEncryptionKey
    }
  );
  const server = buildGatewayServer({
    mockCompletionRepository,
    corsOrigins: env.corsOrigins,
    rateLimiter: new InMemoryRateLimiter(
      env.rateLimitMaxRequests,
      env.rateLimitWindowMs
    ),
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
