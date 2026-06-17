import {
  ChatCompletionRequestSchema,
  ModelFaucetError,
  createErrorResponse,
  createRequestId,
  InMemoryMetrics,
  InMemoryRateLimiter
} from "@modelfaucet/shared";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "./crypto";
import type { MockCompletionRepository } from "./repositories/mockCompletionRepository";

export type BuildGatewayServerOptions = {
  mockCompletionRepository: MockCompletionRepository;
  corsOrigins?: true | string[];
  metrics?: InMemoryMetrics;
  rateLimiter?: InMemoryRateLimiter;
  requestIdFactory?: () => string;
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

function routeLabel(path: string): string {
  return path.split("?")[0] ?? path;
}

function shouldSkipRateLimit(route: string): boolean {
  return route === "/health" || route === "/ready" || route === "/metrics";
}

function injectRequestId(payload: unknown, requestId: string): unknown {
  if (typeof payload !== "string" || !payload.includes("\"error\"")) {
    return payload;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof parsed.error === "object" &&
      parsed.error !== null &&
      !("request_id" in parsed.error)
    ) {
      return JSON.stringify({
        ...parsed,
        error: {
          ...parsed.error,
          request_id: requestId
        }
      });
    }
  } catch {
    return payload;
  }

  return payload;
}

export function buildGatewayServer(options: BuildGatewayServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const now = options.now ?? (() => new Date());
  const metrics = options.metrics ?? new InMemoryMetrics();
  const requestIdFactory =
    options.requestIdFactory ?? (() => createRequestId(Date.now(), Math.random));
  const requestIds = new WeakMap<object, string>();
  const requestStartedAt = new WeakMap<object, number>();

  app.register(cors, {
    origin: options.corsOrigins ?? true
  });

  app.addHook("onRequest", async (request, reply) => {
    const incomingRequestId = request.headers["x-request-id"];
    const requestId =
      typeof incomingRequestId === "string" && incomingRequestId.trim().length > 0
        ? incomingRequestId.trim()
        : requestIdFactory();
    const route = routeLabel(request.url);
    requestIds.set(request.raw, requestId);
    requestStartedAt.set(request.raw, Date.now());
    reply.header("x-request-id", requestId);

    if (options.rateLimiter !== undefined && !shouldSkipRateLimit(route)) {
      const rateLimit = options.rateLimiter.check(`${request.ip}:${route}`, Date.now());
      reply.header("x-ratelimit-remaining", String(rateLimit.remaining));
      reply.header("x-ratelimit-reset", String(Math.ceil(rateLimit.resetAtMs / 1000)));
      if (!rateLimit.allowed) {
        metrics.incrementRateLimited("@modelfaucet/gateway", route);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((rateLimit.resetAtMs - Date.now()) / 1000)
        );
        const error = new ModelFaucetError({
          code: "rate_limited",
          message: "Rate limit exceeded.",
          requestId,
          statusCode: 429
        });
        return reply
          .header("retry-after", String(retryAfterSeconds))
          .code(error.statusCode)
          .send(createErrorResponse(error));
      }
    }
  });

  app.addHook("onSend", async (request, _reply, payload) => {
    const requestId = requestIds.get(request.raw);
    return requestId === undefined ? payload : injectRequestId(payload, requestId);
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAt = requestStartedAt.get(request.raw) ?? Date.now();
    metrics.observeRequest({
      service: "@modelfaucet/gateway",
      method: request.method,
      route: routeLabel(request.url),
      statusCode: reply.statusCode,
      durationMs: Date.now() - startedAt
    });
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

  app.get("/ready", async () => ({
    ok: true,
    service: "@modelfaucet/gateway",
    checks: {
      repository: "configured"
    }
  }));

  app.get("/metrics", async (_request, reply) =>
    reply.type("text/plain; version=0.0.4").send(metrics.renderPrometheus())
  );

  app.get("/health/providers", async () => {
    if (options.mockCompletionRepository.checkProviderHealth === undefined) {
      return {
        ok: true,
        providers: []
      };
    }

    const provider = await options.mockCompletionRepository.checkProviderHealth();
    return {
      ok: provider.ok,
      providers: [provider]
    };
  });

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

    if (parsed.data.stream === true) {
      const error = new ModelFaucetError({
        code: "invalid_request",
        message: "Streaming responses are not enabled in this gateway release.",
        statusCode: 400,
        details: {
          streaming_supported: false
        }
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
