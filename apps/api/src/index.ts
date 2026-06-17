import { pathToFileURL } from "node:url";
import { loadApiEnv } from "./env";
import { PostgresDashboardRepository } from "./repositories/dashboardRepository";
import { PostgresPaymentRepository } from "./repositories/paymentRepository";
import { PostgresPayoutRepository } from "./repositories/payoutRepository";
import { PostgresProviderKeyRepository } from "./repositories/providerKeyRepository";
import { PostgresSessionRepository } from "./repositories/sessionRepository";
import { PostgresWalletRepository } from "./repositories/walletRepository";
import { buildApiServer } from "./server";
import { StripeRestCheckoutClient } from "./stripe";

export * from "./crypto";
export * from "./env";
export * from "./repositories/dashboardRepository";
export * from "./repositories/paymentRepository";
export * from "./repositories/payoutRepository";
export * from "./repositories/providerKeyRepository";
export * from "./repositories/sessionRepository";
export * from "./repositories/walletRepository";
export * from "./secretEncryption";
export * from "./services/ledger";
export * from "./server";
export * from "./stripe";

export async function startApiServer(): Promise<void> {
  const env = loadApiEnv();
  const sessionRepository = new PostgresSessionRepository({
    connectionString: env.databaseUrl
  });
  const dashboardRepository = new PostgresDashboardRepository({
    connectionString: env.databaseUrl
  });
  const providerKeyRepository = new PostgresProviderKeyRepository({
    connectionString: env.databaseUrl
  });
  const walletRepository = new PostgresWalletRepository({
    connectionString: env.databaseUrl
  });
  const paymentRepository = new PostgresPaymentRepository({
    connectionString: env.databaseUrl
  });
  const payoutRepository = new PostgresPayoutRepository({
    connectionString: env.databaseUrl
  });
  const stripeCheckoutClient =
    env.stripeSecretKey === undefined
      ? undefined
      : new StripeRestCheckoutClient({ secretKey: env.stripeSecretKey });
  const server = buildApiServer({
    sessionRepository,
    dashboardRepository,
    providerKeyRepository,
    walletRepository,
    paymentRepository,
    payoutRepository,
    stripeCheckoutClient,
    stripeWebhookSecret: env.stripeWebhookSecret,
    payoutThresholdUsd: env.payoutThresholdUsd,
    secretEncryptionKey: env.secretEncryptionKey,
    developerAdminToken: env.developerAdminToken,
    adminToken: env.adminToken,
    gatewayBaseUrl: env.gatewayBaseUrl,
    sessionTokenTtlSeconds: env.sessionTokenTtlSeconds,
    logger: env.nodeEnv !== "test"
  });

  await server.listen({ port: env.port, host: "0.0.0.0" });
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  startApiServer().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
