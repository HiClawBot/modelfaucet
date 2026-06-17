import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_DEVELOPER_ADMIN_TOKEN,
  DEFAULT_PUBLIC_APP_ID,
  createDeveloperProviderKey,
  deleteDeveloperProviderKey,
  fetchDeveloperProviderKeys,
  fetchUsageDashboard,
  type FetchLike,
  type ProviderKeySummary,
  type UsageDashboardRow,
  type UsageDashboardSummary
} from "./api";
import { dashboardApp } from "./index";

export type AppProps = {
  initialPath?: string;
  fetcher?: FetchLike;
  apiBaseUrl?: string;
  publicAppId?: string;
  developerAdminToken?: string;
};

type PageKey = "dashboard" | "usage" | "revenue" | "providerKeys";

const navItems: Array<{ href: string; label: string; page: PageKey }> = [
  { href: "/dashboard", label: "Overview", page: "dashboard" },
  { href: "/apps/app_pub_demo/usage", label: "Usage", page: "usage" },
  { href: "/revenue", label: "Revenue", page: "revenue" },
  { href: "/provider-keys", label: "Provider keys", page: "providerKeys" }
];

function resolvePage(pathname: string): PageKey {
  if (pathname.startsWith("/apps/app_pub_demo/usage")) {
    return "usage";
  }

  if (pathname.startsWith("/revenue")) {
    return "revenue";
  }

  if (pathname.startsWith("/provider-keys")) {
    return "providerKeys";
  }

  return "dashboard";
}

function formatMoney(value: string): string {
  return `$${Number(value).toFixed(6)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function Metric({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string | number;
  tone?: "default" | "money";
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function UsageTable({ rows }: { rows: UsageDashboardRow[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">No usage events have been recorded yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Request ID</th>
            <th>Feature</th>
            <th>Route</th>
            <th>Model</th>
            <th>Input</th>
            <th>Output</th>
            <th>Retail</th>
            <th>Developer</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.request_id}>
              <td>{row.request_id}</td>
              <td>{row.feature_key ?? "unscoped"}</td>
              <td>{row.route_mode}</td>
              <td>{row.model ?? row.provider ?? "unknown"}</td>
              <td>{row.input_tokens}</td>
              <td>{row.output_tokens}</td>
              <td>{formatMoney(row.retail_price_usd)}</td>
              <td>{formatMoney(row.channel_revenue_usd)}</td>
              <td>{formatDate(row.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewPage({ data }: { data: UsageDashboardSummary }) {
  return (
    <>
      <section className="metrics" aria-label="Usage totals">
        <Metric label="Total calls" value={data.total_calls} />
        <Metric label="Input tokens" value={data.total_input_tokens} />
        <Metric label="Output tokens" value={data.total_output_tokens} />
        <Metric
          label="Retail price"
          tone="money"
          value={formatMoney(data.total_retail_price_usd)}
        />
        <Metric
          label="Developer revenue"
          tone="money"
          value={formatMoney(data.total_developer_revenue_usd)}
        />
      </section>
      <section className="content-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Latest activity</p>
            <h2>Recent usage</h2>
          </div>
          <a href="/apps/app_pub_demo/usage">View all</a>
        </div>
        <UsageTable rows={data.usage.slice(0, 5)} />
      </section>
    </>
  );
}

function UsagePage({ data }: { data: UsageDashboardSummary }) {
  return (
    <section className="content-section">
      <div className="section-header">
        <div>
          <p className="eyebrow">App usage</p>
          <h2>{data.public_app_id}</h2>
        </div>
        <span className="count-label">{data.usage.length} rows</span>
      </div>
      <UsageTable rows={data.usage} />
    </section>
  );
}

function RevenuePage({ data }: { data: UsageDashboardSummary }) {
  const platformRevenue = useMemo(() => {
    const retail = Number(data.total_retail_price_usd);
    const developer = Number(data.total_developer_revenue_usd);
    return Math.max(retail - developer, 0).toFixed(8);
  }, [data.total_developer_revenue_usd, data.total_retail_price_usd]);

  return (
    <>
      <section className="metrics revenue-metrics" aria-label="Revenue totals">
        <Metric
          label="Developer revenue"
          tone="money"
          value={formatMoney(data.total_developer_revenue_usd)}
        />
        <Metric label="Retail price" tone="money" value={formatMoney(data.total_retail_price_usd)} />
        <Metric label="Platform remainder" tone="money" value={formatMoney(platformRevenue)} />
      </section>
      <section className="content-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Revenue detail</p>
            <h2>Channel earnings</h2>
          </div>
        </div>
        <UsageTable rows={data.usage} />
      </section>
    </>
  );
}

function splitModels(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function ProviderKeysPage({
  fetcher,
  apiBaseUrl,
  publicAppId,
  developerAdminToken
}: {
  fetcher?: FetchLike;
  apiBaseUrl: string;
  publicAppId: string;
  developerAdminToken: string;
}) {
  const [keys, setKeys] = useState<ProviderKeySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadKeys = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const items = await fetchDeveloperProviderKeys(
        fetcher,
        apiBaseUrl,
        publicAppId,
        developerAdminToken
      );
      setKeys(items);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Provider keys could not be loaded."
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, developerAdminToken, fetcher, publicAppId]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const provider = formData.get("provider") === "openrouter" ? "openrouter" : "openai";
    const apiKey = optionalString(formData.get("api_key"));
    if (apiKey === undefined) {
      setError("Provider API key is required.");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      await createDeveloperProviderKey(
        {
          public_app_id: publicAppId,
          provider,
          api_key: apiKey,
          base_url: optionalString(formData.get("base_url")),
          models_allowed: splitModels(formData.get("models_allowed")),
          priority: Number(optionalString(formData.get("priority")) ?? "1"),
          budget_limit_usd: optionalString(formData.get("budget_limit_usd")),
          fallback_to_platform: formData.get("fallback_to_platform") === "on"
        },
        fetcher,
        apiBaseUrl,
        developerAdminToken
      );
      form.reset();
      setMessage("Provider key saved.");
      await loadKeys();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Provider key could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(credentialId: string) {
    setError("");
    setMessage("");
    try {
      await deleteDeveloperProviderKey(credentialId, fetcher, apiBaseUrl, developerAdminToken);
      setMessage("Provider key disabled.");
      await loadKeys();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Provider key could not be disabled."
      );
    }
  }

  return (
    <>
      <section className="content-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Cloud routes</p>
            <h2>Provider keys</h2>
          </div>
          <span className="count-label">{keys.length} keys</span>
        </div>
        <form className="key-form" onSubmit={handleSubmit}>
          <label>
            Provider
            <select name="provider" defaultValue="openai">
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </label>
          <label>
            API key
            <input
              name="api_key"
              type="password"
              autoComplete="off"
              placeholder="sk-..."
            />
          </label>
          <label>
            Base URL
            <input name="base_url" type="url" placeholder="https://api.openai.com/v1" />
          </label>
          <label>
            Models
            <input name="models_allowed" placeholder="gpt-4.1-mini, openrouter/auto" />
          </label>
          <label>
            Budget USD
            <input name="budget_limit_usd" inputMode="decimal" placeholder="10.00" />
          </label>
          <label>
            Priority
            <input name="priority" inputMode="numeric" defaultValue="1" />
          </label>
          <label className="checkbox-row">
            <input name="fallback_to_platform" type="checkbox" />
            Fallback
          </label>
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving" : "Save key"}
          </button>
        </form>
        {message.length > 0 ? <p className="success">{message}</p> : null}
        {error.length > 0 ? <p className="error" role="alert">{error}</p> : null}
      </section>
      <section className="content-section">
        {isLoading ? <p className="empty-state">Loading provider keys...</p> : null}
        {!isLoading && keys.length === 0 ? (
          <p className="empty-state">No provider keys have been added.</p>
        ) : null}
        {keys.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Masked key</th>
                  <th>Status</th>
                  <th>Models</th>
                  <th>Budget</th>
                  <th>Priority</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.provider}</td>
                    <td>{key.masked}</td>
                    <td>{key.status}</td>
                    <td>{key.models_allowed.join(", ") || "any"}</td>
                    <td>{key.budget_limit_usd === undefined ? "none" : formatMoney(key.budget_limit_usd)}</td>
                    <td>{key.priority}</td>
                    <td>
                      <button
                        className="table-button"
                        type="button"
                        disabled={key.status === "disabled"}
                        onClick={() => void handleDelete(key.id)}
                      >
                        Disable
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}

export function App({
  initialPath,
  fetcher,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  publicAppId = DEFAULT_PUBLIC_APP_ID,
  developerAdminToken = DEFAULT_DEVELOPER_ADMIN_TOKEN
}: AppProps) {
  const [data, setData] = useState<UsageDashboardSummary | undefined>();
  const [error, setError] = useState("");
  const page = resolvePage(
    initialPath ?? (typeof window === "undefined" ? "/dashboard" : window.location.pathname)
  );

  useEffect(() => {
    let isMounted = true;

    fetchUsageDashboard(fetcher, apiBaseUrl, publicAppId).then(
      (summary) => {
        if (isMounted) {
          setData(summary);
        }
      },
      (caughtError: unknown) => {
        if (isMounted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Dashboard data could not be loaded."
          );
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, fetcher, publicAppId]);

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">ModelFaucet</p>
          <h1>Developer dashboard</h1>
        </div>
        <nav aria-label="Dashboard navigation">
          {navItems.map((item) => (
            <a
              aria-current={item.page === page ? "page" : undefined}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <p className="boundary">{dashboardApp.providerKeyBoundary}</p>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">{data?.public_app_id ?? DEFAULT_PUBLIC_APP_ID}</p>
            <h2>{data?.app_name ?? "CRM Demo"}</h2>
          </div>
          <span className="status-chip">Read-only MVP</span>
        </header>

        {error.length > 0 ? <p className="error" role="alert">{error}</p> : null}
        {data === undefined && error.length === 0 ? (
          <p className="empty-state">Loading dashboard data...</p>
        ) : null}
        {data !== undefined && page === "dashboard" ? <OverviewPage data={data} /> : null}
        {data !== undefined && page === "usage" ? <UsagePage data={data} /> : null}
        {data !== undefined && page === "revenue" ? <RevenuePage data={data} /> : null}
        {page === "providerKeys" ? (
          <ProviderKeysPage
            fetcher={fetcher}
            apiBaseUrl={apiBaseUrl}
            publicAppId={publicAppId}
            developerAdminToken={developerAdminToken}
          />
        ) : null}
      </section>
    </main>
  );
}
