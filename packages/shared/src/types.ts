export const ROUTE_MODES = ["platform", "developer_key", "byok", "local"] as const;
export type RouteMode = (typeof ROUTE_MODES)[number];

export const CHAT_ROLES = ["system", "user", "assistant", "tool"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const ERROR_CODES = [
  "invalid_request",
  "invalid_session",
  "expired_session",
  "invalid_app",
  "feature_not_found",
  "no_available_route",
  "insufficient_balance",
  "budget_exceeded",
  "rate_limited",
  "provider_error",
  "local_bridge_unavailable",
  "secret_validation_failed"
] as const;

export type ModelFaucetErrorCode = (typeof ERROR_CODES)[number];
export type JsonObject = Record<string, unknown>;
export type MoneyString = string;

export type CreateSessionRequest = {
  public_app_id: string;
  external_user_id: string;
  feature_key?: string;
  metadata?: JsonObject;
};

export type CreateSessionResponse = {
  session_token: `mf_sess_${string}`;
  expires_in: number;
  gateway_base_url: string;
  available_modes: RouteMode[];
  wallet_balance_usd: MoneyString;
};

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  metadata?: JsonObject;
};

export type AddProviderKeyRequest = {
  provider: string;
  api_key: string;
  base_url?: string;
  models_allowed?: string[];
  budget_limit_usd?: MoneyString;
  priority?: number;
  fallback_to_platform?: boolean;
};

export type UsageEvent = {
  request_id: string;
  app_id: string;
  developer_id: string;
  end_user_id?: string;
  feature_key?: string;
  route_mode: RouteMode;
  provider?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  upstream_cost_usd: MoneyString;
  retail_price_usd: MoneyString;
  gross_margin_usd: MoneyString;
  channel_revenue_usd: MoneyString;
  platform_revenue_usd: MoneyString;
  metadata?: JsonObject;
  created_at?: string;
};

export type RatedUsage = {
  request_id: string;
  route_mode: RouteMode;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  upstream_cost_usd: MoneyString;
  retail_price_usd: MoneyString;
  gross_margin_usd: MoneyString;
  channel_revenue_usd: MoneyString;
  platform_revenue_usd: MoneyString;
};

export type RevenueRule = {
  route_mode?: RouteMode;
  markup_percent?: number;
  channel_share_bps: number;
  explicit_gateway_fee_usd?: MoneyString;
};

export type ModelPrice = {
  input_price_per_1m_tokens_usd: MoneyString;
  output_price_per_1m_tokens_usd: MoneyString;
  cached_price_per_1m_tokens_usd?: MoneyString;
};

