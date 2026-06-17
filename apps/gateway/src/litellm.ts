import {
  ModelFaucetError,
  isCloudSafeBaseUrl,
  type ChatCompletionRequest
} from "@modelfaucet/shared";

export type ProviderAttempt = {
  attempt: number;
  provider: string;
  statusCode?: number;
  errorCode?: string;
  retryable: boolean;
  durationMs: number;
};

export type ProviderUsageSource = "provider" | "estimated" | "reconciled";

export type ProviderCompletionResult = {
  provider: string;
  model: string;
  messageContent: string;
  promptTokens: number;
  completionTokens: number;
  attempts: ProviderAttempt[];
  usageSource: ProviderUsageSource;
  usageWarnings: string[];
};

export type ProviderCredentialContext = {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  modelsAllowed: string[];
};

export type CompletionProvider = {
  createChatCompletion(input: {
    request: ChatCompletionRequest;
    featureKey?: string;
    providerCredential?: ProviderCredentialContext;
  }): Promise<ProviderCompletionResult>;
  checkHealth?(): Promise<ProviderHealthResult>;
};

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type ProviderHealthResult = {
  ok: boolean;
  provider: string;
  statusCode?: number;
  latencyMs: number;
  error?: string;
};

export type LiteLlmClientOptions = {
  baseUrl: string;
  masterKey: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
};

function routeModel(model: string, providerCredential?: ProviderCredentialContext): string {
  if (!model.startsWith("auto:")) {
    return model;
  }

  return providerCredential?.modelsAllowed[0] ?? "auto-text";
}

export function buildLiteLlmChatCompletionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = basePath.endsWith("/v1")
    ? `${basePath}/chat/completions`
    : `${basePath}/v1/chat/completions`;
  url.search = "";
  return url.toString();
}

export function buildLiteLlmHealthUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = basePath.endsWith("/v1")
    ? `${basePath.slice(0, -3)}/health`
    : `${basePath}/health`;
  url.search = "";
  return url.toString();
}

function estimateTextTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function estimatePromptTokens(request: ChatCompletionRequest): number {
  const characters = request.messages.reduce((sum, message) => sum + message.content.length, 0);
  return Math.max(1, Math.ceil(characters / 4));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readTokenCount(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : undefined;
}

function readAssistantContent(body: Record<string, unknown>): string {
  const choices = body.choices;
  if (!Array.isArray(choices)) {
    return "";
  }

  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice.message);
  const content = message.content;
  return typeof content === "string" ? content : "";
}

function defaultProviderBaseUrl(provider: string): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    default:
      return "https://api.openai.com/v1";
  }
}

function byokBaseUrl(providerCredential: ProviderCredentialContext): string {
  const baseUrl = providerCredential.baseUrl ?? defaultProviderBaseUrl(providerCredential.provider);
  if (!isCloudSafeBaseUrl(baseUrl)) {
    throw new ModelFaucetError({
      code: "no_available_route",
      message: "BYOK provider base URL is not allowed for cloud routing.",
      statusCode: 400
    });
  }

  return baseUrl;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function sanitizeErrorCode(error: unknown): string {
  if (isAbortError(error)) {
    return "timeout";
  }

  if (error instanceof Error && error.name.length > 0) {
    return error.name;
  }

  return "network_error";
}

function normalizeUsage(input: {
  request: ChatCompletionRequest;
  messageContent: string;
  usage: Record<string, unknown>;
}): {
  promptTokens: number;
  completionTokens: number;
  usageSource: ProviderUsageSource;
  usageWarnings: string[];
} {
  const usageWarnings: string[] = [];
  const providerPromptTokens = readTokenCount(input.usage, "prompt_tokens");
  const providerCompletionTokens = readTokenCount(input.usage, "completion_tokens");
  const providerTotalTokens = readTokenCount(input.usage, "total_tokens");
  const estimatedPromptTokens = estimatePromptTokens(input.request);
  const estimatedCompletionTokens = estimateTextTokens(input.messageContent);
  let promptTokens = providerPromptTokens ?? estimatedPromptTokens;
  let completionTokens = providerCompletionTokens ?? estimatedCompletionTokens;
  let usageSource: ProviderUsageSource =
    providerPromptTokens === undefined || providerCompletionTokens === undefined
      ? "estimated"
      : "provider";

  if (providerPromptTokens === undefined) {
    usageWarnings.push("provider_prompt_tokens_missing");
  }

  if (providerCompletionTokens === undefined) {
    usageWarnings.push("provider_completion_tokens_missing");
  }

  if (
    providerTotalTokens !== undefined &&
    providerTotalTokens !== promptTokens + completionTokens
  ) {
    usageSource = "reconciled";

    if (
      providerPromptTokens !== undefined &&
      providerCompletionTokens === undefined &&
      providerTotalTokens >= providerPromptTokens
    ) {
      completionTokens = providerTotalTokens - providerPromptTokens;
    } else if (
      providerPromptTokens === undefined &&
      providerCompletionTokens !== undefined &&
      providerTotalTokens >= providerCompletionTokens
    ) {
      promptTokens = providerTotalTokens - providerCompletionTokens;
    } else {
      usageWarnings.push("provider_total_tokens_mismatch");
    }
  }

  return {
    promptTokens,
    completionTokens,
    usageSource,
    usageWarnings
  };
}

export class LiteLlmClient implements CompletionProvider {
  private readonly baseUrl: string;
  private readonly masterKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: LiteLlmClientOptions) {
    this.baseUrl = options.baseUrl;
    this.masterKey = options.masterKey;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 1;
    this.retryDelayMs = options.retryDelayMs ?? 250;
  }

  async checkHealth(): Promise<ProviderHealthResult> {
    const startedAt = Date.now();
    try {
      const response = await this.fetchWithTimeout(buildLiteLlmHealthUrl(this.baseUrl), {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.masterKey}`
        }
      });
      return {
        ok: response.ok,
        provider: "litellm",
        statusCode: response.status,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      return {
        ok: false,
        provider: "litellm",
        latencyMs: Date.now() - startedAt,
        error: sanitizeErrorCode(error)
      };
    }
  }

  async createChatCompletion(input: {
    request: ChatCompletionRequest;
    featureKey?: string;
    providerCredential?: ProviderCredentialContext;
  }): Promise<ProviderCompletionResult> {
    const providerCredential = input.providerCredential;
    const routedModel = routeModel(input.request.model, providerCredential);
    const requestBaseUrl =
      providerCredential !== undefined ? byokBaseUrl(providerCredential) : this.baseUrl;
    const authorization =
      providerCredential !== undefined ? providerCredential.apiKey : this.masterKey;
    const providerName = providerCredential?.provider ?? "litellm";
    const { response, attempts } = await this.fetchChatCompletionWithRetry({
      url: buildLiteLlmChatCompletionsUrl(requestBaseUrl),
      authorization,
      providerName,
      body: {
        ...input.request,
        model: routedModel
      }
    });

    const body = asRecord(await response.json());
    const messageContent = readAssistantContent(body);
    const usage = asRecord(body.usage);
    const normalizedUsage = normalizeUsage({
      request: input.request,
      messageContent,
      usage
    });
    const responseModel = body.model;

    return {
      provider: providerName,
      model: typeof responseModel === "string" ? responseModel : routedModel,
      messageContent,
      promptTokens: normalizedUsage.promptTokens,
      completionTokens: normalizedUsage.completionTokens,
      attempts,
      usageSource: normalizedUsage.usageSource,
      usageWarnings: normalizedUsage.usageWarnings
    };
  }

  private async fetchChatCompletionWithRetry(input: {
    url: string;
    authorization: string;
    providerName: string;
    body: unknown;
  }): Promise<{ response: Response; attempts: ProviderAttempt[] }> {
    const attempts: ProviderAttempt[] = [];
    const maxAttempts = this.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      try {
        const response = await this.fetchWithTimeout(input.url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${input.authorization}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(input.body)
        });
        const retryable = isRetryableStatus(response.status);
        attempts.push({
          attempt,
          provider: input.providerName,
          statusCode: response.status,
          retryable,
          durationMs: Date.now() - startedAt
        });

        if (response.ok) {
          return { response, attempts };
        }

        await response.body?.cancel();

        if (!retryable || attempt >= maxAttempts) {
          throw new ModelFaucetError({
            code: "provider_error",
            message: `Provider request failed with status ${response.status}.`,
            statusCode: 502,
            details: {
              provider: input.providerName,
              status_code: response.status,
              attempts
            }
          });
        }
      } catch (error) {
        if (error instanceof ModelFaucetError) {
          throw error;
        }

        const retryable = true;
        attempts.push({
          attempt,
          provider: input.providerName,
          errorCode: sanitizeErrorCode(error),
          retryable,
          durationMs: Date.now() - startedAt
        });

        if (attempt >= maxAttempts) {
          throw new ModelFaucetError({
            code: "provider_error",
            message: isAbortError(error)
              ? "Provider request timed out."
              : "Provider request failed before a response was received.",
            statusCode: isAbortError(error) ? 504 : 502,
            details: {
              provider: input.providerName,
              attempts
            }
          });
        }
      }

      await new Promise((resolve) => {
        setTimeout(resolve, this.retryDelayMs);
      });
    }

    throw new ModelFaucetError({
      code: "provider_error",
      message: "Provider request failed.",
      statusCode: 502,
      details: {
        provider: input.providerName,
        attempts
      }
    });
  }

  private async fetchWithTimeout(input: string | URL, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      return await this.fetchImpl(input, {
        ...init,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
