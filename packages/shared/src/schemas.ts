import { z } from "zod";
import { CHAT_ROLES, ERROR_CODES, ROUTE_MODES } from "./types";

const identifierPattern = /^[a-zA-Z0-9_:-]+$/;
const moneyPattern = /^(0|[1-9]\d*)(\.\d{1,8})?$/;

export const RouteModeSchema = z.enum(ROUTE_MODES);
export const ChatRoleSchema = z.enum(CHAT_ROLES);
export const ErrorCodeSchema = z.enum(ERROR_CODES);

export const MetadataSchema = z.record(z.string(), z.unknown());

export const PublicAppIdSchema = z.string().min(1).max(128).regex(identifierPattern);
export const FeatureKeySchema = z.string().min(1).max(128).regex(identifierPattern);
export const RequestIdSchema = z.string().min(1).max(128).regex(identifierPattern);
export const MoneyStringSchema = z.string().regex(moneyPattern);

function isPrivateIpv4Parts(parts: number[]): boolean {
  const [first = -1, second = -1] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function parseIpv4Parts(hostname: string): number[] | undefined {
  const octets = hostname.split(".");
  if (octets.length !== 4) {
    return undefined;
  }

  const parts = octets.map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return undefined;
  }

  return parts;
}

function parseIpv4MappedIpv6Parts(hostname: string): number[] | undefined {
  if (!hostname.startsWith("::ffff:")) {
    return undefined;
  }

  const suffix = hostname.slice("::ffff:".length);
  const dottedParts = parseIpv4Parts(suffix);
  if (dottedParts !== undefined) {
    return dottedParts;
  }

  const groups = suffix.split(":");
  if (groups.length !== 2) {
    return undefined;
  }

  const high = Number.parseInt(groups[0] ?? "", 16);
  const low = Number.parseInt(groups[1] ?? "", 16);
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return undefined;
  }

  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

export function isPrivateNetworkHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const hostnameWithoutTrailingDot = normalized.replace(/\.$/, "");

  if (
    hostnameWithoutTrailingDot === "localhost" ||
    hostnameWithoutTrailingDot.endsWith(".localhost") ||
    hostnameWithoutTrailingDot === "metadata" ||
    hostnameWithoutTrailingDot === "metadata.google.internal"
  ) {
    return true;
  }

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  const mappedIpv4Parts = parseIpv4MappedIpv6Parts(normalized);
  if (mappedIpv4Parts !== undefined) {
    return isPrivateIpv4Parts(mappedIpv4Parts);
  }

  const parts = parseIpv4Parts(normalized);
  if (parts === undefined) {
    return false;
  }

  return isPrivateIpv4Parts(parts);
}

export function isCloudSafeBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !isPrivateNetworkHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

export const CloudSafeBaseUrlSchema = z
  .string()
  .url()
  .refine(isCloudSafeBaseUrl, "Cloud services must not access localhost or private LAN URLs");

export const CreateSessionRequestSchema = z
  .object({
    public_app_id: PublicAppIdSchema,
    external_user_id: z.string().min(1).max(512),
    feature_key: FeatureKeySchema.optional(),
    metadata: MetadataSchema.optional()
  })
  .strict();

export const CreateSessionResponseSchema = z
  .object({
    session_token: z.string().regex(/^mf_sess_[a-zA-Z0-9_-]+$/),
    expires_in: z.number().int().positive(),
    gateway_base_url: z.string().url(),
    available_modes: z.array(RouteModeSchema).min(1),
    wallet_balance_usd: MoneyStringSchema
  })
  .strict();

export const ChatMessageSchema = z
  .object({
    role: ChatRoleSchema,
    content: z.string().min(1)
  })
  .strict();

export const ChatCompletionRequestSchema = z
  .object({
    model: z.string().min(1).max(256),
    messages: z.array(ChatMessageSchema).min(1),
    stream: z.boolean().optional().default(false),
    metadata: MetadataSchema.optional()
  })
  .strict();

export const AddProviderKeyRequestSchema = z
  .object({
    provider: z.string().min(1).max(64).regex(identifierPattern),
    api_key: z.string().min(1).max(4096),
    base_url: CloudSafeBaseUrlSchema.optional(),
    models_allowed: z.array(z.string().min(1).max(256)).optional().default([]),
    budget_limit_usd: MoneyStringSchema.optional(),
    priority: z.number().int().min(1).max(1000).optional().default(100),
    fallback_to_platform: z.boolean().optional().default(false)
  })
  .strict();

const TokenCountSchema = z.number().int().min(0);

export const UsageEventSchema = z
  .object({
    request_id: RequestIdSchema,
    app_id: z.string().min(1),
    developer_id: z.string().min(1),
    end_user_id: z.string().min(1).optional(),
    feature_key: FeatureKeySchema.optional(),
    route_mode: RouteModeSchema,
    provider: z.string().min(1).optional(),
    model: z.string().min(1),
    input_tokens: TokenCountSchema,
    output_tokens: TokenCountSchema,
    cached_tokens: TokenCountSchema.default(0),
    upstream_cost_usd: MoneyStringSchema.default("0"),
    retail_price_usd: MoneyStringSchema.default("0"),
    gross_margin_usd: MoneyStringSchema.default("0"),
    channel_revenue_usd: MoneyStringSchema.default("0"),
    platform_revenue_usd: MoneyStringSchema.default("0"),
    metadata: MetadataSchema.optional(),
    created_at: z.string().datetime().optional()
  })
  .strict();

export const RatedUsageSchema = z
  .object({
    request_id: RequestIdSchema,
    route_mode: RouteModeSchema,
    input_tokens: TokenCountSchema,
    output_tokens: TokenCountSchema,
    cached_tokens: TokenCountSchema.default(0),
    upstream_cost_usd: MoneyStringSchema,
    retail_price_usd: MoneyStringSchema,
    gross_margin_usd: MoneyStringSchema,
    channel_revenue_usd: MoneyStringSchema,
    platform_revenue_usd: MoneyStringSchema
  })
  .strict();

export const RevenueRuleSchema = z
  .object({
    route_mode: RouteModeSchema.optional(),
    markup_percent: z.number().min(0).max(1000).optional().default(30),
    channel_share_bps: z.number().int().min(0).max(10000),
    explicit_gateway_fee_usd: MoneyStringSchema.optional()
  })
  .strict();

export type CreateSessionRequestInput = z.infer<typeof CreateSessionRequestSchema>;
export type CreateSessionResponseInput = z.infer<typeof CreateSessionResponseSchema>;
export type ChatCompletionRequestInput = z.infer<typeof ChatCompletionRequestSchema>;
export type AddProviderKeyRequestInput = z.infer<typeof AddProviderKeyRequestSchema>;
export type UsageEventInput = z.infer<typeof UsageEventSchema>;
export type RatedUsageInput = z.infer<typeof RatedUsageSchema>;
export type RevenueRuleInput = z.infer<typeof RevenueRuleSchema>;
