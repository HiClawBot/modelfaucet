import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_DEVELOPER_ADMIN_TOKEN,
  DEFAULT_PUBLIC_APP_ID,
  archiveDeveloperApp,
  createDeveloperApp,
  createDeveloperFeature,
  createDeveloperProviderKey,
  deleteDeveloperFeature,
  deleteDeveloperProviderKey,
  fetchDeveloperApps,
  fetchDeveloperFeatures,
  fetchDeveloperOperations,
  fetchDeveloperProviderKeys,
  fetchUsageDashboard,
  updateDeveloperApp,
  updateDeveloperFeature,
  type DeveloperAppSummary,
  type DeveloperFeatureSummary,
  type DeveloperOperationsSummary,
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

type PageKey =
  | "dashboard"
  | "apps"
  | "features"
  | "operations"
  | "usage"
  | "revenue"
  | "providerKeys";

const navItems: Array<{ href: string; label: string; page: PageKey }> = [
  { href: "/dashboard", label: "Overview", page: "dashboard" },
  { href: "/apps", label: "Apps", page: "apps" },
  { href: "/features", label: "Features", page: "features" },
  { href: "/operations", label: "Operations", page: "operations" },
  { href: "/apps/app_pub_demo/usage", label: "Usage", page: "usage" },
  { href: "/revenue", label: "Revenue", page: "revenue" },
  { href: "/provider-keys", label: "Provider keys", page: "providerKeys" }
];

function resolvePage(pathname: string): PageKey {
  if (pathname.startsWith("/apps/app_pub_demo/usage")) {
    return "usage";
  }

  if (pathname.startsWith("/features")) {
    return "features";
  }

  if (pathname.startsWith("/operations")) {
    return "operations";
  }

  if (pathname.startsWith("/apps")) {
    return "apps";
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

function formatBps(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function formatJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
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

function parseJsonObject(label: string, value: FormDataEntryValue | null): Record<string, unknown> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function parseRevenueShare(value: FormDataEntryValue | null): number {
  const share = Number(optionalString(value) ?? "4000");
  if (!Number.isInteger(share) || share < 0 || share > 10000) {
    throw new Error("Revenue share must be a whole number from 0 to 10000 bps.");
  }

  return share;
}

function appStatus(value: FormDataEntryValue | null): "active" | "disabled" {
  return value === "disabled" ? "disabled" : "active";
}

function AppsPage({
  fetcher,
  apiBaseUrl,
  developerAdminToken
}: {
  fetcher?: FetchLike;
  apiBaseUrl: string;
  developerAdminToken: string;
}) {
  const [apps, setApps] = useState<DeveloperAppSummary[]>([]);
  const [editingApp, setEditingApp] = useState<DeveloperAppSummary | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadApps = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setApps(await fetchDeveloperApps(fetcher, apiBaseUrl, developerAdminToken));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Apps could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, developerAdminToken, fetcher]);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const publicAppId = optionalString(formData.get("public_app_id"));
    const name = optionalString(formData.get("name"));
    if (publicAppId === undefined || name === undefined) {
      setError("Public app ID and name are required.");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const input = {
        public_app_id: publicAppId,
        name,
        vertical: optionalString(formData.get("vertical")),
        default_revenue_share_bps: parseRevenueShare(
          formData.get("default_revenue_share_bps")
        ),
        status: appStatus(formData.get("status"))
      };
      if (editingApp === undefined) {
        await createDeveloperApp(input, fetcher, apiBaseUrl, developerAdminToken);
        setMessage("App created.");
      } else {
        await updateDeveloperApp(
          editingApp.public_app_id,
          {
            name: input.name,
            vertical: input.vertical,
            default_revenue_share_bps: input.default_revenue_share_bps,
            status: input.status
          },
          fetcher,
          apiBaseUrl,
          developerAdminToken
        );
        setEditingApp(undefined);
        setMessage("App updated.");
      }

      form.reset();
      await loadApps();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "App could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive(publicAppId: string) {
    setError("");
    setMessage("");
    try {
      await archiveDeveloperApp(publicAppId, fetcher, apiBaseUrl, developerAdminToken);
      setMessage("App archived.");
      await loadApps();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "App could not be archived.");
    }
  }

  return (
    <>
      <section className="content-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Developer console</p>
            <h2>Apps</h2>
          </div>
          <span className="count-label">{apps.length} apps</span>
        </div>
        <form className="key-form console-form" key={editingApp?.public_app_id ?? "new-app"} onSubmit={handleSubmit}>
          <label>
            Public app ID
            <input
              name="public_app_id"
              defaultValue={editingApp?.public_app_id ?? ""}
              placeholder="app_pub_support"
              readOnly={editingApp !== undefined}
            />
          </label>
          <label>
            Name
            <input name="name" defaultValue={editingApp?.name ?? ""} placeholder="Support Console" />
          </label>
          <label>
            Vertical
            <input name="vertical" defaultValue={editingApp?.vertical ?? ""} placeholder="crm" />
          </label>
          <label>
            Revenue bps
            <input
              name="default_revenue_share_bps"
              inputMode="numeric"
              defaultValue={editingApp?.default_revenue_share_bps ?? 4000}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={editingApp?.status === "disabled" ? "disabled" : "active"}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <button type="submit" disabled={isSaving}>
            {editingApp === undefined ? "Create app" : "Save app"}
          </button>
          {editingApp !== undefined ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setEditingApp(undefined)}
            >
              Cancel
            </button>
          ) : null}
        </form>
        {message.length > 0 ? <p className="success">{message}</p> : null}
        {error.length > 0 ? <p className="error" role="alert">{error}</p> : null}
      </section>
      <section className="content-section">
        {isLoading ? <p className="empty-state">Loading apps...</p> : null}
        {!isLoading && apps.length === 0 ? (
          <p className="empty-state">No apps have been created.</p>
        ) : null}
        {apps.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Public app ID</th>
                  <th>Name</th>
                  <th>Vertical</th>
                  <th>Share</th>
                  <th>Status</th>
                  <th>Developer</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.public_app_id}>
                    <td>{app.public_app_id}</td>
                    <td>{app.name}</td>
                    <td>{app.vertical ?? "unscoped"}</td>
                    <td>{formatBps(app.default_revenue_share_bps)}</td>
                    <td>{app.status}</td>
                    <td>{app.developer_name}</td>
                    <td>{formatDate(app.updated_at)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="table-button"
                          type="button"
                          onClick={() => setEditingApp(app)}
                        >
                          Edit
                        </button>
                        <button
                          className="table-button"
                          type="button"
                          disabled={app.status === "disabled"}
                          onClick={() => void handleArchive(app.public_app_id)}
                        >
                          Archive
                        </button>
                      </div>
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

const defaultPolicyJson = JSON.stringify(
  {
    route_preference: ["local", "end_user_byok", "developer_key", "platform_pool"],
    privacy: "redact_pii_before_cloud",
    model_policy: "cheapest_sufficient"
  },
  null,
  2
);

const defaultPricingJson = JSON.stringify(
  {
    mode: "usage_markup",
    markup_percent: 30,
    channel_share_bps: 4000
  },
  null,
  2
);

function FeaturesPage({
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
  const [selectedPublicAppId, setSelectedPublicAppId] = useState(publicAppId);
  const [features, setFeatures] = useState<DeveloperFeatureSummary[]>([]);
  const [editingFeature, setEditingFeature] = useState<DeveloperFeatureSummary | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadFeatures = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setFeatures(
        await fetchDeveloperFeatures(
          fetcher,
          apiBaseUrl,
          selectedPublicAppId,
          developerAdminToken
        )
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Features could not be loaded."
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, developerAdminToken, fetcher, selectedPublicAppId]);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  function handleScopeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextAppId = optionalString(new FormData(event.currentTarget).get("public_app_id"));
    if (nextAppId !== undefined) {
      setEditingFeature(undefined);
      setSelectedPublicAppId(nextAppId);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const featureKey = optionalString(formData.get("feature_key"));
    const displayName = optionalString(formData.get("display_name"));
    if (featureKey === undefined || displayName === undefined) {
      setError("Feature key and display name are required.");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const policy = parseJsonObject("Policy", formData.get("policy_json"));
      const pricing = parseJsonObject("Pricing", formData.get("pricing_json"));
      if (editingFeature === undefined) {
        await createDeveloperFeature(
          selectedPublicAppId,
          {
            feature_key: featureKey,
            display_name: displayName,
            policy,
            pricing
          },
          fetcher,
          apiBaseUrl,
          developerAdminToken
        );
        setMessage("Feature created.");
      } else {
        await updateDeveloperFeature(
          selectedPublicAppId,
          editingFeature.feature_key,
          {
            display_name: displayName,
            policy,
            pricing
          },
          fetcher,
          apiBaseUrl,
          developerAdminToken
        );
        setEditingFeature(undefined);
        setMessage("Feature updated.");
      }

      form.reset();
      await loadFeatures();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Feature could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(featureKey: string) {
    setError("");
    setMessage("");
    try {
      await deleteDeveloperFeature(
        selectedPublicAppId,
        featureKey,
        fetcher,
        apiBaseUrl,
        developerAdminToken
      );
      setMessage("Feature deleted.");
      await loadFeatures();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Feature could not be deleted."
      );
    }
  }

  return (
    <>
      <section className="content-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Route policy</p>
            <h2>Features</h2>
          </div>
          <span className="count-label">{selectedPublicAppId}</span>
        </div>
        <form className="key-form scope-form" onSubmit={handleScopeSubmit}>
          <label>
            App ID
            <input name="public_app_id" defaultValue={selectedPublicAppId} />
          </label>
          <button type="submit">Load features</button>
        </form>
        <form
          className="key-form console-form feature-form"
          key={editingFeature?.feature_key ?? "new-feature"}
          onSubmit={handleSubmit}
        >
          <label>
            Feature key
            <input
              name="feature_key"
              defaultValue={editingFeature?.feature_key ?? ""}
              placeholder="customer_reply"
              readOnly={editingFeature !== undefined}
            />
          </label>
          <label>
            Display name
            <input
              name="display_name"
              defaultValue={editingFeature?.display_name ?? ""}
              placeholder="Customer reply"
            />
          </label>
          <label className="form-wide">
            Policy JSON
            <textarea
              name="policy_json"
              defaultValue={
                editingFeature === undefined ? defaultPolicyJson : formatJson(editingFeature.policy)
              }
            />
          </label>
          <label className="form-wide">
            Pricing JSON
            <textarea
              name="pricing_json"
              defaultValue={
                editingFeature === undefined ? defaultPricingJson : formatJson(editingFeature.pricing)
              }
            />
          </label>
          <button type="submit" disabled={isSaving}>
            {editingFeature === undefined ? "Create feature" : "Save feature"}
          </button>
          {editingFeature !== undefined ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setEditingFeature(undefined)}
            >
              Cancel
            </button>
          ) : null}
        </form>
        {message.length > 0 ? <p className="success">{message}</p> : null}
        {error.length > 0 ? <p className="error" role="alert">{error}</p> : null}
      </section>
      <section className="content-section">
        {isLoading ? <p className="empty-state">Loading features...</p> : null}
        {!isLoading && features.length === 0 ? (
          <p className="empty-state">No features have been created.</p>
        ) : null}
        {features.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Name</th>
                  <th>Policy</th>
                  <th>Pricing</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {features.map((feature) => (
                  <tr key={feature.id}>
                    <td>{feature.feature_key}</td>
                    <td>{feature.display_name}</td>
                    <td>{formatJson(feature.policy)}</td>
                    <td>{formatJson(feature.pricing)}</td>
                    <td>{formatDate(feature.updated_at)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="table-button"
                          type="button"
                          onClick={() => setEditingFeature(feature)}
                        >
                          Edit
                        </button>
                        <button
                          className="table-button"
                          type="button"
                          onClick={() => void handleDelete(feature.feature_key)}
                        >
                          Delete
                        </button>
                      </div>
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

function OperationsPage({
  fetcher,
  apiBaseUrl,
  developerAdminToken
}: {
  fetcher?: FetchLike;
  apiBaseUrl: string;
  developerAdminToken: string;
}) {
  const [data, setData] = useState<DeveloperOperationsSummary | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    fetchDeveloperOperations(fetcher, apiBaseUrl, developerAdminToken).then(
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
              : "Operations data could not be loaded."
          );
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, developerAdminToken, fetcher]);

  if (error.length > 0) {
    return <p className="error" role="alert">{error}</p>;
  }

  if (data === undefined) {
    return <p className="empty-state">Loading operations...</p>;
  }

  return (
    <>
      <section className="metrics revenue-metrics" aria-label="Operations totals">
        <Metric label="Wallets" value={data.wallets.length} />
        <Metric label="Top-ups" value={data.topups.length} />
        <Metric label="Payouts" value={data.payouts.length} />
      </section>
      <section className="content-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Money movement</p>
            <h2>Wallets</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Owner</th>
                <th>Scope</th>
                <th>Balance</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.wallets.map((wallet) => (
                <tr key={wallet.id}>
                  <td>{wallet.owner_name ?? wallet.owner_id}</td>
                  <td>{wallet.owner_scope}</td>
                  <td>{formatMoney(wallet.balance_usd)}</td>
                  <td>{formatDate(wallet.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="content-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Review queue</p>
            <h2>Payouts</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Developer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.payouts.map((payout) => (
                <tr key={payout.id}>
                  <td>{payout.developer_name}</td>
                  <td>{formatMoney(payout.amount_usd)}</td>
                  <td>{payout.status}</td>
                  <td>{payout.provider ?? "none"}</td>
                  <td>{formatDate(payout.updated_at)}</td>
                </tr>
              ))}
              {data.payouts.length === 0 ? (
                <tr>
                  <td colSpan={5}>No payouts have been created.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="content-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Sensitive actions</p>
            <h2>Audit log</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Resource</th>
                <th>Metadata</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.audit_logs.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.action}</td>
                  <td>{entry.actor_scope}</td>
                  <td>{entry.resource_type}</td>
                  <td>{formatJson(entry.metadata)}</td>
                  <td>{formatDate(entry.created_at)}</td>
                </tr>
              ))}
              {data.audit_logs.length === 0 ? (
                <tr>
                  <td colSpan={5}>No audit log entries are available.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="content-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Stripe test mode</p>
            <h2>Top-ups</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Wallet</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.topups.map((topup) => (
                <tr key={topup.id}>
                  <td>{topup.provider}</td>
                  <td>{formatMoney(topup.amount_usd)}</td>
                  <td>{topup.status}</td>
                  <td>{topup.wallet_id}</td>
                  <td>{formatDate(topup.created_at)}</td>
                </tr>
              ))}
              {data.topups.length === 0 ? (
                <tr>
                  <td colSpan={5}>No top-ups have been recorded.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
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
  const requiresUsageData = page === "dashboard" || page === "usage" || page === "revenue";

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
          <span className="status-chip">Console beta</span>
        </header>

        {requiresUsageData && error.length > 0 ? <p className="error" role="alert">{error}</p> : null}
        {requiresUsageData && data === undefined && error.length === 0 ? (
          <p className="empty-state">Loading dashboard data...</p>
        ) : null}
        {data !== undefined && page === "dashboard" ? <OverviewPage data={data} /> : null}
        {page === "apps" ? (
          <AppsPage
            fetcher={fetcher}
            apiBaseUrl={apiBaseUrl}
            developerAdminToken={developerAdminToken}
          />
        ) : null}
        {page === "features" ? (
          <FeaturesPage
            fetcher={fetcher}
            apiBaseUrl={apiBaseUrl}
            publicAppId={publicAppId}
            developerAdminToken={developerAdminToken}
          />
        ) : null}
        {page === "operations" ? (
          <OperationsPage
            fetcher={fetcher}
            apiBaseUrl={apiBaseUrl}
            developerAdminToken={developerAdminToken}
          />
        ) : null}
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
