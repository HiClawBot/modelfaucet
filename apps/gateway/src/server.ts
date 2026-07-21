import {
  ChatCompletionRequestSchema,
  ModelFaucetError,
  createErrorResponse,
  createRequestId,
  InMemoryMetrics,
  type RateLimiter
} from "@modelfaucet/shared";
import cors from "@fastify/cors";
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions
} from "fastify";
import { hashSessionToken } from "./crypto";
import type { MockCompletionRepository } from "./repositories/mockCompletionRepository";

export type BuildGatewayServerOptions = {
  mockCompletionRepository: MockCompletionRepository;
  corsOrigins?: true | string[];
  metrics?: InMemoryMetrics;
  metricsToken?: string;
  trustProxy?: FastifyServerOptions["trustProxy"];
  rateLimiter?: RateLimiter;
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

function routeLabel(request: FastifyRequest): string {
  const route = request.routeOptions.url;
  return typeof route === "string" && route.length > 0 ? route : "/__unmatched__";
}

function shouldSkipRateLimit(route: string): boolean {
  return route === "/health" || route === "/ready" || route === "/metrics";
}

async function readinessStatus(check: (() => void | Promise<void>) | undefined): Promise<string> {
  if (check === undefined) {
    return "configured";
  }

  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(check),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Readiness check timed out.")), 2_000);
      })
    ]);
    return "ok";
  } catch {
    return "unavailable";
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
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
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false
  });
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
    const route = routeLabel(request);
    requestIds.set(request.raw, requestId);
    requestStartedAt.set(request.raw, Date.now());
    reply.header("x-request-id", requestId);

    if (options.rateLimiter !== undefined && !shouldSkipRateLimit(route)) {
      const sessionToken = extractBearerToken(request.headers.authorization);
      const keys = [`ip:${request.ip}:route:${route}`];
      if (sessionToken !== undefined) {
        keys.push(`session:${hashSessionToken(sessionToken)}:route:${route}`);
      }
      const limits = await Promise.all(
        keys.map((key) => options.rateLimiter?.check(key, Date.now()))
      );
      const checkedLimits = limits.filter((limit) => limit !== undefined);
      const remaining = Math.min(...checkedLimits.map((limit) => limit.remaining));
      const resetAtMs = Math.max(...checkedLimits.map((limit) => limit.resetAtMs));
      reply.header("x-ratelimit-remaining", String(remaining));
      reply.header("x-ratelimit-reset", String(Math.ceil(resetAtMs / 1000)));
      if (checkedLimits.some((limit) => !limit.allowed)) {
        metrics.incrementRateLimited("@modelfaucet/gateway", route);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((resetAtMs - Date.now()) / 1000)
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
      route: routeLabel(request),
      statusCode: reply.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  if (
    options.mockCompletionRepository.close !== undefined ||
    options.rateLimiter?.close !== undefined
  ) {
    app.addHook("onClose", async () => {
      await options.mockCompletionRepository.close?.();
      await options.rateLimiter?.close?.();
    });
  }

  app.get("/health", async () => ({
    ok: true,
    service: "@modelfaucet/gateway"
  }));

  app.get("/ready", async (_request, reply) => {
    const [database, rateLimit, provider] = await Promise.all([
      readinessStatus(
        options.mockCompletionRepository.checkHealth?.bind(options.mockCompletionRepository)
      ),
      readinessStatus(options.rateLimiter?.checkHealth?.bind(options.rateLimiter)),
      readinessStatus(
        options.mockCompletionRepository.checkProviderHealth === undefined
          ? undefined
          : async () => {
              const result = await options.mockCompletionRepository.checkProviderHealth?.();
              if (result?.ok !== true) {
                throw new Error("Provider readiness check failed.");
              }
            }
      )
    ]);
    const ok = ![database, rateLimit, provider].includes("unavailable");
    return reply.code(ok ? 200 : 503).send({
      ok,
      service: "@modelfaucet/gateway",
      checks: {
        database,
        rate_limit: rateLimit,
        provider
      }
    });
  });

  app.get("/metrics", async (request, reply) => {
    if (options.metricsToken !== undefined) {
      const token = extractBearerToken(request.headers.authorization);
      if (token !== options.metricsToken) {
        const error = new ModelFaucetError({
          code: "invalid_session",
          message: "Missing or invalid metrics token.",
          statusCode: 401
        });
        return reply.code(error.statusCode).send(createErrorResponse(error));
      }
    }
    return reply.type("text/plain; version=0.0.4").send(metrics.renderPrometheus());
  });

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

    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
      const error = new ModelFaucetError({
        code: "invalid_request",
        message: "Idempotency-Key is required for chat completions.",
        statusCode: 400
      });
      return reply.code(error.statusCode).send(createErrorResponse(error));
    }

    try {
      const result = await options.mockCompletionRepository.createMockCompletion({
        sessionTokenHash: hashSessionToken(sessionToken),
        request: parsed.data,
        createdAt: now(),
        idempotencyKey
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
