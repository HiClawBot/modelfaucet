import {
  ChatCompletionRequestSchema,
  CreateSessionResponseSchema,
  type ChatCompletionRequest,
  type ChatMessage,
  type CreateSessionResponse,
  type RouteMode
} from "@modelfaucet/shared";

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

export type FaucetLocalClient = {
  detectBridge(): Promise<FaucetLocalBridgeStatus>;
  listModels(): Promise<FaucetLocalModelsResponse>;
};

export type FaucetClient = {
  createSession(featureKey?: string): Promise<FaucetSession>;
  chat(input: FaucetChatInput): Promise<FaucetChatResult>;
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

  async function reportLocalUsage(input: {
    requestId: string;
    feature: string;
    provider: string;
    model: string;
    usage: Record<string, unknown>;
  }): Promise<void> {
    await parseJsonResponse(
      await fetchImpl(joinUrl(localBridgeBaseUrl, "/usage/report"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
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
        })
      })
    );
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

    await reportLocalUsage({
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
        feature_key: input.feature
      }
    };
  }

  return {
    createSession,
    chat,
    local: {
      detectBridge,
      listModels
    }
  };
}
