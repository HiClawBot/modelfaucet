import {
  ChatCompletionRequestSchema,
  CreateSessionResponseSchema,
  type ChatCompletionRequest,
  type ChatMessage,
  type CreateSessionResponse,
  type RouteMode
} from "@modelfaucet/shared";

export type { RouteMode } from "@modelfaucet/shared";

export type FaucetOptions = {
  publicAppId: string;
  baseUrl?: string;
  gatewayBaseUrl?: string;
  localBridgeBaseUrl?: string;
  user: {
    id: string;
    email?: string;
    metadata?: Record<string, unknown>;
  };
};

export type FaucetSession = CreateSessionResponse & {
  expiresAtMs: number;
  featureKey?: string;
};

export type FaucetChatInput = {
  feature: string;
  input?: string | Record<string, unknown>;
  messages?: ChatMessage[];
  model?: string;
  routeMode?: RouteMode;
  stream?: boolean;
};

export type FaucetChatResult = Record<string, unknown>;

export type FaucetFeatureCallInput = {
  feature: string;
  input: string | Record<string, unknown>;
  model?: string;
  routeMode?: RouteMode;
};

export type FaucetFeatureResult = {
  text: string;
  raw: FaucetChatResult;
  usage: Record<string, unknown>;
  modelfaucet: Record<string, unknown>;
};

export type FaucetLocalBridgeStatus = {
  available: boolean;
  baseUrl: string;
  health?: Record<string, unknown>;
};

export type FaucetLocalModel = {
  id: string;
  provider: string;
  endpoint_id: string;
  capabilities: string[];
};

export type FaucetLocalModelsResponse = {
  items: FaucetLocalModel[];
};

export type FaucetLocalDiagnostics = {
  available: boolean;
  baseUrl: string;
  health?: Record<string, unknown>;
  models?: FaucetLocalModel[];
  problems: string[];
};

export type FaucetLocalUsageReport = {
  request_id: string;
  app_id: string;
  end_user_id_hash: string;
  feature_key: string;
  route_mode: "local";
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
};

export type FaucetLocalUsageFlushResult = {
  flushed: number;
  pending: number;
};

export type FaucetLocalClient = {
  detectBridge(): Promise<FaucetLocalBridgeStatus>;
  listModels(): Promise<FaucetLocalModelsResponse>;
  diagnose(): Promise<FaucetLocalDiagnostics>;
  pendingUsageReports(): FaucetLocalUsageReport[];
  flushUsageReports(): Promise<FaucetLocalUsageFlushResult>;
};

export type FaucetClient = {
  createSession(featureKey?: string): Promise<FaucetSession>;
  chat(input: FaucetChatInput): Promise<FaucetChatResult>;
  runFeature(input: FaucetFeatureCallInput): Promise<FaucetFeatureResult>;
  local: FaucetLocalClient;
};

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type FaucetClientInternals = {
  fetch?: FetchLike;
  now?: () => number;
};

export const sdkPackage = {
  name: "@modelfaucet/sdk",
  acceptsProviderApiKeysByDefault: false
} as const;

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const DEFAULT_GATEWAY_BASE_URL = "http://localhost:3002/v1";
const DEFAULT_LOCAL_BRIDGE_BASE_URL = "http://127.0.0.1:8787";
const SESSION_REFRESH_BUFFER_MS = 5_000;

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function chatCompletionsUrl(gatewayBaseUrl: string): string {
  const normalized = gatewayBaseUrl.replace(/\/$/, "");
  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function localChatCompletionsUrl(localBridgeBaseUrl: string): string {
  return joinUrl(localBridgeBaseUrl, "/v1/chat/completions");
}

function messagesFromInput(input: FaucetChatInput): ChatMessage[] {
  if (input.messages !== undefined) {
    return input.messages;
  }

  const content =
    typeof input.input === "string" ? input.input : JSON.stringify(input.input ?? {});
  return [{ role: "user", content }];
}

function toSessionToken(value: string): `mf_sess_${string}` {
  if (!value.startsWith("mf_sess_")) {
    throw new Error("Invalid ModelFaucet session token");
  }

  return value as `mf_sess_${string}`;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`ModelFaucet request failed with status ${response.status}`);
  }

  return body;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function responseText(result: Record<string, unknown>): string {
  const choices = result.choices;
  if (Array.isArray(choices)) {
    const firstChoice = choices[0];
    if (typeof firstChoice === "object" && firstChoice !== null) {
      const message = "message" in firstChoice ? firstChoice.message : undefined;
      if (typeof message === "object" && message !== null && "content" in message) {
        const content = message.content;
        if (typeof content === "string") {
          return content;
        }
      }

      const text = "text" in firstChoice ? firstChoice.text : undefined;
      if (typeof text === "string") {
        return text;
      }
    }
  }

  const outputText = result.output_text;
  if (typeof outputText === "string") {
    return outputText;
  }

  return JSON.stringify(result, null, 2);
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function createLocalRequestId(now: () => number): string {
  return `req_local_${Math.trunc(now()).toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

async function hashLocalEndUserId(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    return `sha256-unavailable:${value}`;
  }

  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

export function createFaucet(
  options: FaucetOptions,
  internals: FaucetClientInternals = {}
): FaucetClient {
  const apiBaseUrl = options.baseUrl ?? DEFAULT_API_BASE_URL;
  const configuredGatewayBaseUrl = options.gatewayBaseUrl ?? DEFAULT_GATEWAY_BASE_URL;
  const localBridgeBaseUrl = options.localBridgeBaseUrl ?? DEFAULT_LOCAL_BRIDGE_BASE_URL;
  const fetchImpl = internals.fetch ?? fetch;
  const now = internals.now ?? (() => Date.now());
  let currentSession: FaucetSession | undefined;
  let pendingLocalUsageReports: FaucetLocalUsageReport[] = [];

  async function createSession(featureKey?: string): Promise<FaucetSession> {
    const response = await fetchImpl(joinUrl(apiBaseUrl, "/v1/sessions"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        public_app_id: options.publicAppId,
        external_user_id: options.user.id,
        feature_key: featureKey,
        metadata: options.user.metadata
      })
    });
    const parsed = CreateSessionResponseSchema.parse(await parseJsonResponse(response));
    const session: FaucetSession = {
      ...parsed,
      session_token: toSessionToken(parsed.session_token),
      gateway_base_url: parsed.gateway_base_url || configuredGatewayBaseUrl,
      expiresAtMs: now() + parsed.expires_in * 1000,
      featureKey
    };
    currentSession = session;
    return session;
  }

  async function ensureSession(featureKey: string): Promise<FaucetSession> {
    const session = currentSession;
    const sessionIsUsable =
      session !== undefined &&
      session.expiresAtMs - SESSION_REFRESH_BUFFER_MS > now() &&
      (session.featureKey === undefined || session.featureKey === featureKey);

    if (sessionIsUsable) {
      return session;
    }

    return createSession(featureKey);
  }

  async function chat(input: FaucetChatInput): Promise<FaucetChatResult> {
    if (input.routeMode === "local") {
      return chatLocal(input);
    }

    const session = await ensureSession(input.feature);
    const request: ChatCompletionRequest = ChatCompletionRequestSchema.parse({
      model: input.model ?? `auto:${input.feature}`,
      messages: messagesFromInput(input),
      stream: input.stream ?? false,
      metadata: {
        feature_key: input.feature
      }
    });

    const response = await fetchImpl(chatCompletionsUrl(session.gateway_base_url), {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.session_token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });

    return parseJsonResponse(response) as Promise<FaucetChatResult>;
  }

  async function runFeature(input: FaucetFeatureCallInput): Promise<FaucetFeatureResult> {
    const raw = await chat({
      feature: input.feature,
      input: input.input,
      model: input.model,
      routeMode: input.routeMode
    });

    return {
      text: responseText(raw),
      raw,
      usage: asRecord(raw.usage),
      modelfaucet: asRecord(raw.modelfaucet)
    };
  }

  async function detectBridge(): Promise<FaucetLocalBridgeStatus> {
    try {
      const response = await fetchImpl(joinUrl(localBridgeBaseUrl, "/health"));
      if (!response.ok) {
        return { available: false, baseUrl: localBridgeBaseUrl };
      }

      return {
        available: true,
        baseUrl: localBridgeBaseUrl,
        health: asRecord(await response.json())
      };
    } catch {
      return { available: false, baseUrl: localBridgeBaseUrl };
    }
  }

  async function listModels(): Promise<FaucetLocalModelsResponse> {
    const response = await fetchImpl(joinUrl(localBridgeBaseUrl, "/models"));
    return parseJsonResponse(response) as Promise<FaucetLocalModelsResponse>;
  }

  async function diagnose(): Promise<FaucetLocalDiagnostics> {
    const bridge = await detectBridge();
    if (!bridge.available) {
      return {
        available: false,
        baseUrl: bridge.baseUrl,
        health: bridge.health,
        problems: ["local_bridge_unavailable"]
      };
    }

    try {
      const models = await listModels();
      return {
        available: true,
        baseUrl: bridge.baseUrl,
        health: bridge.health,
        models: models.items,
        problems: models.items.length === 0 ? ["no_local_models"] : []
      };
    } catch (caughtError) {
      return {
        available: true,
        baseUrl: bridge.baseUrl,
        health: bridge.health,
        problems: [
          caughtError instanceof Error ? caughtError.message : "local_models_unavailable"
        ]
      };
    }
  }

  async function sendLocalUsageReport(report: FaucetLocalUsageReport): Promise<void> {
    await parseJsonResponse(
      await fetchImpl(joinUrl(localBridgeBaseUrl, "/usage/report"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(report)
      })
    );
  }

  async function flushUsageReports(): Promise<FaucetLocalUsageFlushResult> {
    const queue = pendingLocalUsageReports;
    pendingLocalUsageReports = [];
    let flushed = 0;
    const remaining: FaucetLocalUsageReport[] = [];

    for (const report of queue) {
      try {
        await sendLocalUsageReport(report);
        flushed += 1;
      } catch {
        remaining.push(report);
      }
    }

    pendingLocalUsageReports = remaining;
    return {
      flushed,
      pending: pendingLocalUsageReports.length
    };
  }

  function pendingUsageReports(): FaucetLocalUsageReport[] {
    return pendingLocalUsageReports.map((report) => ({ ...report }));
  }

  async function reportLocalUsage(input: {
    requestId: string;
    feature: string;
    provider: string;
    model: string;
    usage: Record<string, unknown>;
  }): Promise<"sent" | "queued"> {
    const report: FaucetLocalUsageReport = {
      request_id: input.requestId,
      app_id: options.publicAppId,
      end_user_id_hash: await hashLocalEndUserId(options.user.id),
      feature_key: input.feature,
      route_mode: "local",
      provider: input.provider,
      model: input.model,
      input_tokens: readNumber(input.usage, "prompt_tokens"),
      output_tokens: readNumber(input.usage, "completion_tokens"),
      created_at: new Date(now()).toISOString()
    };

    try {
      await sendLocalUsageReport(report);
      return "sent";
    } catch {
      pendingLocalUsageReports.push(report);
      return "queued";
    }
  }

  async function chatLocal(input: FaucetChatInput): Promise<FaucetChatResult> {
    const request: ChatCompletionRequest = ChatCompletionRequestSchema.parse({
      model: input.model ?? `ollama:${input.feature}`,
      messages: messagesFromInput(input),
      stream: input.stream ?? false,
      metadata: {
        feature_key: input.feature,
        route_mode: "local"
      }
    });

    const response = await fetchImpl(localChatCompletionsUrl(localBridgeBaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });
    const parsed = asRecord(await parseJsonResponse(response));
    const usage = asRecord(parsed.usage);
    const requestId = createLocalRequestId(now);
    const model = typeof parsed.model === "string" ? parsed.model : request.model;
    const provider = request.model.startsWith("ollama:") ? "ollama" : "local";

    const usageReportStatus = await reportLocalUsage({
      requestId,
      feature: input.feature,
      provider,
      model,
      usage
    });

    return {
      ...parsed,
      modelfaucet: {
        ...asRecord(parsed.modelfaucet),
        request_id: requestId,
        route_mode: "local",
        feature_key: input.feature,
        usage_report_status: usageReportStatus
      }
    };
  }

  return {
    createSession,
    chat,
    runFeature,
    local: {
      detectBridge,
      listModels,
      diagnose,
      pendingUsageReports,
      flushUsageReports
    }
  };
}
