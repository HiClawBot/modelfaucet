export type UsageDashboardRow = {
  request_id: string;
  feature_key: string | null;
  route_mode: string;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  retail_price_usd: string;
  channel_revenue_usd: string;
  created_at: string;
};

export type UsageDashboardSummary = {
  public_app_id: string;
  app_name: string;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_retail_price_usd: string;
  total_developer_revenue_usd: string;
  usage: UsageDashboardRow[];
};

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type ProviderKeySummary = {
  id: string;
  provider: "openai" | "openrouter" | string;
  base_url?: string;
  masked: string;
  status: string;
  models_allowed: string[];
  priority: number;
  budget_limit_usd?: string;
  fallback_to_platform: boolean;
};

export type CreateDeveloperProviderKeyInput = {
  public_app_id: string;
  provider: "openai" | "openrouter";
  api_key: string;
  base_url?: string;
  models_allowed: string[];
  priority: number;
  budget_limit_usd?: string;
  fallback_to_platform: boolean;
};

export const DEFAULT_PUBLIC_APP_ID = "app_pub_demo";
export const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_MODELFAUCET_API_BASE_URL ?? "http://localhost:3001";
export const DEFAULT_DEVELOPER_ADMIN_TOKEN =
  import.meta.env.VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN ?? "";

function requireDeveloperAdminToken(developerAdminToken: string): string {
  const trimmed = developerAdminToken.trim();
  if (trimmed.length === 0) {
    throw new Error("Developer admin token is required.");
  }

  return trimmed;
}

function parseProviderKeyItems(body: unknown): ProviderKeySummary[] {
  const record =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as { items?: unknown })
      : {};
  return Array.isArray(record.items) ? (record.items as ProviderKeySummary[]) : [];
}

export async function fetchUsageDashboard(
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  publicAppId = DEFAULT_PUBLIC_APP_ID
): Promise<UsageDashboardSummary> {
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/apps/${publicAppId}/usage`
  );
  if (!response.ok) {
    throw new Error(`Dashboard request failed with status ${response.status}`);
  }

  return (await response.json()) as UsageDashboardSummary;
}

export async function fetchDeveloperProviderKeys(
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  publicAppId = DEFAULT_PUBLIC_APP_ID,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<ProviderKeySummary[]> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/developer/provider-keys?public_app_id=${encodeURIComponent(
      publicAppId
    )}`,
    {
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  );
  if (!response.ok) {
    throw new Error(`Provider key request failed with status ${response.status}`);
  }

  return parseProviderKeyItems(await response.json());
}

export async function createDeveloperProviderKey(
  input: CreateDeveloperProviderKeyInput,
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<ProviderKeySummary> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(`${apiBaseUrl.replace(/\/$/, "")}/v1/developer/provider-keys`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Provider key create failed with status ${response.status}`);
  }

  return (await response.json()) as ProviderKeySummary;
}

export async function deleteDeveloperProviderKey(
  credentialId: string,
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<void> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/developer/provider-keys/${encodeURIComponent(
      credentialId
    )}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  );
  if (!response.ok) {
    throw new Error(`Provider key delete failed with status ${response.status}`);
  }
}
