import {
  ModelFaucetError,
  isCloudSafeBaseUrl,
  type ChatCompletionRequest
} from "@modelfaucet/shared";

export type ProviderCompletionResult = {
  provider: string;
  model: string;
  messageContent: string;
  promptTokens: number;
  completionTokens: number;
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
};

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type LiteLlmClientOptions = {
  baseUrl: string;
  masterKey: string;
  fetch?: FetchLike;
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

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

export class LiteLlmClient implements CompletionProvider {
  private readonly baseUrl: string;
  private readonly masterKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: LiteLlmClientOptions) {
    this.baseUrl = options.baseUrl;
    this.masterKey = options.masterKey;
    this.fetchImpl = options.fetch ?? fetch;
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
    const response = await this.fetchImpl(buildLiteLlmChatCompletionsUrl(requestBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${authorization}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ...input.request,
        model: routedModel
      })
    });

    if (!response.ok) {
      throw new ModelFaucetError({
        code: "provider_error",
        message: `LiteLLM request failed with status ${response.status}`,
        statusCode: 502
      });
    }

    const body = asRecord(await response.json());
    const messageContent = readAssistantContent(body);
    const usage = asRecord(body.usage);
    const promptTokens = readNumber(usage, "prompt_tokens") ?? estimatePromptTokens(input.request);
    const completionTokens =
      readNumber(usage, "completion_tokens") ?? estimateTextTokens(messageContent);
    const responseModel = body.model;

    return {
      provider: providerCredential?.provider ?? "litellm",
      model: typeof responseModel === "string" ? responseModel : routedModel,
      messageContent,
      promptTokens,
      completionTokens
    };
  }
}
