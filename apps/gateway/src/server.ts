import {
  ChatCompletionRequestSchema,
  ModelFaucetError,
  createErrorResponse
} from "@modelfaucet/shared";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "./crypto";
import type { MockCompletionRepository } from "./repositories/mockCompletionRepository";

export type BuildGatewayServerOptions = {
  mockCompletionRepository: MockCompletionRepository;
  now?: () => Date;
  logger?: boolean;
};

function toModelFaucetError(error: unknown): ModelFaucetError {
  if (error instanceof ModelFaucetError) {
    return error;
  }

  return new ModelFaucetError({
    code: "provider_error",
    message: "The gateway request could not be processed.",
    statusCode: 500
  });
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

export function buildGatewayServer(options: BuildGatewayServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const now = options.now ?? (() => new Date());

  app.register(cors, {
    origin: true
  });

  if (options.mockCompletionRepository.close !== undefined) {
    app.addHook("onClose", async () => {
      await options.mockCompletionRepository.close?.();
    });
  }

  app.get("/health", async () => ({
    ok: true,
    service: "@modelfaucet/gateway"
  }));

  app.post("/v1/chat/completions", async (request, reply) => {
    const sessionToken = extractBearerToken(request.headers.authorization);
    if (sessionToken === undefined) {
      const error = new ModelFaucetError({
        code: "invalid_session",
        message: "Missing bearer session token.",
        statusCode: 401
      });
      return reply.code(error.statusCode).send(createErrorResponse(error));
    }

    const parsed = ChatCompletionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const error = new ModelFaucetError({
        code: "invalid_request",
        message: "Invalid chat completion request.",
        statusCode: 400,
        details: parsed.error.flatten()
      });
      return reply.code(error.statusCode).send(createErrorResponse(error));
    }

    try {
      const result = await options.mockCompletionRepository.createMockCompletion({
        sessionTokenHash: hashSessionToken(sessionToken),
        request: parsed.data,
        createdAt: now()
      });

      return {
        id: `chatcmpl_mf_${result.requestId}`,
        object: "chat.completion",
        created: Math.floor(now().getTime() / 1000),
        model: result.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: result.messageContent
            },
            finish_reason: "stop"
          }
        ],
        usage: {
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          total_tokens: result.promptTokens + result.completionTokens
        },
        modelfaucet: {
          request_id: result.requestId,
          route_mode: result.routeMode,
          feature_key: result.featureKey,
          estimated_price_usd: result.estimatedPriceUsd
        }
      };
    } catch (error) {
      const modelFaucetError = toModelFaucetError(error);
      return reply
        .code(modelFaucetError.statusCode)
        .send(createErrorResponse(modelFaucetError));
    }
  });

  return app;
}
