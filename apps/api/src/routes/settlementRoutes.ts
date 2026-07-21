import {
  MoneyStringSchema,
  ModelFaucetError,
  createErrorResponse,
  parseMoneyToUnits
} from "@modelfaucet/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { SettlementRepository } from "../repositories/settlementRepository";
import { toModelFaucetError } from "../routeErrors";

export type RegisterSettlementRoutesOptions = {
  settlementRepository?: SettlementRepository;
  authorize(request: FastifyRequest): void;
  now(): Date;
};

const WalletIdParamsSchema = z.object({
  id: z.string().uuid()
});

const WalletAdjustmentRequestSchema = z
  .object({
    kind: z.enum(["adjustment", "refund", "chargeback"]).default("adjustment"),
    direction: z.enum(["credit", "debit"]),
    amount_usd: MoneyStringSchema.refine(
      (value) => parseMoneyToUnits(value) > 0n,
      "Wallet adjustment amount must be greater than zero."
    ),
    reason: z.string().min(1).max(1000).optional(),
    idempotency_key: z.string().min(8).max(128).optional()
  })
  .strict();

function requireSettlementRepository(
  repository: SettlementRepository | undefined
): SettlementRepository {
  if (repository === undefined) {
    throw new ModelFaucetError({
      code: "invalid_request",
      message: "Settlement repository is not configured.",
      statusCode: 500
    });
  }

  return repository;
}

function sendRouteError(reply: FastifyReply, error: unknown): FastifyReply {
  const modelFaucetError = toModelFaucetError(error);
  return reply
    .code(modelFaucetError.statusCode)
    .send(createErrorResponse(modelFaucetError));
}

export function registerSettlementRoutes(
  app: FastifyInstance,
  options: RegisterSettlementRoutesOptions
): void {
  app.get("/v1/admin/reconciliation/ledger", async (request, reply) => {
    try {
      const repository = requireSettlementRepository(options.settlementRepository);
      options.authorize(request);
      return await repository.getLedgerReconciliation(options.now());
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.post("/v1/admin/wallets/:id/adjustments", async (request, reply) => {
    try {
      const repository = requireSettlementRepository(options.settlementRepository);
      options.authorize(request);
      const params = WalletIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Missing or invalid wallet id.",
          statusCode: 400,
          details: params.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const parsed = WalletAdjustmentRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const error = new ModelFaucetError({
          code: "invalid_request",
          message: "Invalid wallet adjustment request.",
          statusCode: 400,
          details: parsed.error.flatten()
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }

      const adjustment = await repository.createWalletAdjustment({
        walletId: params.data.id,
        kind: parsed.data.kind,
        direction: parsed.data.direction,
        amountUsd: parsed.data.amount_usd,
        reason: parsed.data.reason,
        idempotencyKey: parsed.data.idempotency_key,
        now: options.now()
      });
      return reply.code(201).send(adjustment);
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.get("/v1/admin/reports/usage.csv", async (request, reply) => {
    try {
      const repository = requireSettlementRepository(options.settlementRepository);
      options.authorize(request);
      return reply.type("text/csv; charset=utf-8").send(await repository.exportUsageCsv());
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.get("/v1/admin/reports/revenue.csv", async (request, reply) => {
    try {
      const repository = requireSettlementRepository(options.settlementRepository);
      options.authorize(request);
      return reply
        .type("text/csv; charset=utf-8")
        .send(await repository.exportRevenueCsv());
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });

  app.get("/v1/admin/reports/payouts.csv", async (request, reply) => {
    try {
      const repository = requireSettlementRepository(options.settlementRepository);
      options.authorize(request);
      return reply
        .type("text/csv; charset=utf-8")
        .send(await repository.exportPayoutsCsv());
    } catch (error) {
      return sendRouteError(reply, error);
    }
  });
}
