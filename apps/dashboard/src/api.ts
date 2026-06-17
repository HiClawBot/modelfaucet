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

export type DeveloperAppSummary = {
  public_app_id: string;
  name: string;
  vertical?: string;
  default_revenue_share_bps: number;
  status: string;
  developer_id: string;
  developer_name: string;
  developer_email: string;
  created_at: string;
  updated_at: string;
};

export type SaveDeveloperAppInput = {
  public_app_id: string;
  name: string;
  vertical?: string;
  default_revenue_share_bps: number;
  status: "active" | "disabled";
};

export type UpdateDeveloperAppInput = Partial<
  Pick<SaveDeveloperAppInput, "name" | "vertical" | "default_revenue_share_bps" | "status">
>;

export type DeveloperFeatureSummary = {
  id: string;
  public_app_id: string;
  feature_key: string;
  display_name: string;
  policy: Record<string, unknown>;
  pricing: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SaveDeveloperFeatureInput = {
  feature_key: string;
  display_name: string;
  policy: Record<string, unknown>;
  pricing: Record<string, unknown>;
};

export type UpdateDeveloperFeatureInput = Partial<
  Pick<SaveDeveloperFeatureInput, "display_name" | "policy" | "pricing">
>;

export type DeveloperWalletSummary = {
  id: string;
  owner_scope: string;
  owner_id: string;
  owner_name?: string;
  balance_usd: string;
  updated_at: string;
};

export type DeveloperTopupSummary = {
  id: string;
  wallet_id: string;
  owner_scope: string;
  owner_id: string;
  provider: string;
  provider_checkout_session_id: string;
  amount_usd: string;
  status: string;
  checkout_url?: string;
  created_at: string;
  updated_at: string;
};

export type DeveloperPayoutSummary = {
  id: string;
  developer_id: string;
  developer_name: string;
  amount_usd: string;
  status: string;
  provider?: string;
  provider_payout_id?: string;
  created_at: string;
  updated_at: string;
};

export type DeveloperAuditLogSummary = {
  id: string;
  actor_scope: string;
  actor_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DeveloperOperationsSummary = {
  wallets: DeveloperWalletSummary[];
  topups: DeveloperTopupSummary[];
  payouts: DeveloperPayoutSummary[];
  audit_logs: DeveloperAuditLogSummary[];
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

function parseItems<T>(body: unknown): T[] {
  const record =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as { items?: unknown })
      : {};
  return Array.isArray(record.items) ? (record.items as T[]) : [];
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

export async function fetchDeveloperApps(
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<DeveloperAppSummary[]> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(`${apiBaseUrl.replace(/\/$/, "")}/v1/developer/apps`, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Developer apps request failed with status ${response.status}`);
  }

  return parseItems<DeveloperAppSummary>(await response.json());
}

export async function createDeveloperApp(
  input: SaveDeveloperAppInput,
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<DeveloperAppSummary> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(`${apiBaseUrl.replace(/\/$/, "")}/v1/developer/apps`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    throw new Error(`Developer app create failed with status ${response.status}`);
  }

  return (await response.json()) as DeveloperAppSummary;
}

export async function updateDeveloperApp(
  publicAppId: string,
  input: UpdateDeveloperAppInput,
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<DeveloperAppSummary> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/developer/apps/${encodeURIComponent(publicAppId)}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
  if (!response.ok) {
    throw new Error(`Developer app update failed with status ${response.status}`);
  }

  return (await response.json()) as DeveloperAppSummary;
}

export async function archiveDeveloperApp(
  publicAppId: string,
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<DeveloperAppSummary> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/developer/apps/${encodeURIComponent(publicAppId)}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  );
  if (!response.ok) {
    throw new Error(`Developer app archive failed with status ${response.status}`);
  }

  return (await response.json()) as DeveloperAppSummary;
}

export async function fetchDeveloperFeatures(
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  publicAppId = DEFAULT_PUBLIC_APP_ID,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<DeveloperFeatureSummary[]> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/developer/apps/${encodeURIComponent(
      publicAppId
    )}/features`,
    {
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  );
  if (!response.ok) {
    throw new Error(`Developer feature request failed with status ${response.status}`);
  }

  return parseItems<DeveloperFeatureSummary>(await response.json());
}

export async function createDeveloperFeature(
  publicAppId: string,
  input: SaveDeveloperFeatureInput,
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<DeveloperFeatureSummary> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/developer/apps/${encodeURIComponent(
      publicAppId
    )}/features`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
  if (!response.ok) {
    throw new Error(`Developer feature create failed with status ${response.status}`);
  }

  return (await response.json()) as DeveloperFeatureSummary;
}

export async function updateDeveloperFeature(
  publicAppId: string,
  featureKey: string,
  input: UpdateDeveloperFeatureInput,
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<DeveloperFeatureSummary> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/developer/apps/${encodeURIComponent(
      publicAppId
    )}/features/${encodeURIComponent(featureKey)}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(input)
    }
  );
  if (!response.ok) {
    throw new Error(`Developer feature update failed with status ${response.status}`);
  }

  return (await response.json()) as DeveloperFeatureSummary;
}

export async function deleteDeveloperFeature(
  publicAppId: string,
  featureKey: string,
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<void> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/developer/apps/${encodeURIComponent(
      publicAppId
    )}/features/${encodeURIComponent(featureKey)}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  );
  if (!response.ok) {
    throw new Error(`Developer feature delete failed with status ${response.status}`);
  }
}

export async function fetchDeveloperOperations(
  fetcher: FetchLike = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
): Promise<DeveloperOperationsSummary> {
  const token = requireDeveloperAdminToken(developerAdminToken);
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, "")}/v1/developer/operations`,
    {
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  );
  if (!response.ok) {
    throw new Error(`Developer operations request failed with status ${response.status}`);
  }

  return (await response.json()) as DeveloperOperationsSummary;
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
