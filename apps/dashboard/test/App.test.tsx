// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import {
  fetchDeveloperApps,
  fetchDeveloperProviderKeys,
  fetchUsageDashboard
} from "../src/api";
import { dashboardApp } from "../src/index";

const dashboardResponse = {
  public_app_id: "app_pub_demo",
  app_name: "CRM Demo",
  total_calls: 2,
  total_input_tokens: 120,
  total_output_tokens: 80,
  total_retail_price_usd: "0.00130000",
  total_developer_revenue_usd: "0.00052000",
  usage: [
    {
      request_id: "req_123",
      feature_key: "customer_reply",
      route_mode: "platform",
      provider: "litellm",
      model: "auto-text",
      input_tokens: 70,
      output_tokens: 40,
      retail_price_usd: "0.00078000",
      channel_revenue_usd: "0.00031200",
      created_at: "2026-06-17T00:00:00.000Z"
    },
    {
      request_id: "req_456",
      feature_key: "customer_reply",
      route_mode: "platform",
      provider: "litellm",
      model: "auto-text",
      input_tokens: 50,
      output_tokens: 40,
      retail_price_usd: "0.00052000",
      channel_revenue_usd: "0.00020800",
      created_at: "2026-06-17T00:01:00.000Z"
    }
  ]
};

const providerKeysResponse = {
  items: [
    {
      id: "22222222-2222-2222-2222-222222222222",
      provider: "openai",
      masked: "sk-...abcd",
      status: "active",
      models_allowed: ["gpt-4.1-mini"],
      priority: 1,
      budget_limit_usd: "1.00000000",
      fallback_to_platform: false
    }
  ]
};

const appsResponse = {
  items: [
    {
      public_app_id: "app_pub_demo",
      name: "CRM Demo",
      vertical: "crm",
      default_revenue_share_bps: 4000,
      status: "active",
      developer_id: "22222222-2222-4222-8222-222222222222",
      developer_name: "Demo Developer",
      developer_email: "dev@example.com",
      created_at: "2026-06-17T00:00:00.000Z",
      updated_at: "2026-06-17T00:00:00.000Z"
    }
  ]
};

const featureResponse = {
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      public_app_id: "app_pub_demo",
      feature_key: "customer_reply",
      display_name: "Customer reply",
      policy: {
        route_preference: ["local", "developer_key", "platform_pool"]
      },
      pricing: {
        mode: "usage_markup",
        markup_percent: 30,
        channel_share_bps: 4000
      },
      created_at: "2026-06-17T00:00:00.000Z",
      updated_at: "2026-06-17T00:00:00.000Z"
    }
  ]
};

const operationsResponse = {
  wallets: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      owner_scope: "developer",
      owner_id: "22222222-2222-4222-8222-222222222222",
      owner_name: "Demo Developer",
      balance_usd: "1.25000000",
      updated_at: "2026-06-17T00:00:00.000Z"
    }
  ],
  topups: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      wallet_id: "33333333-3333-4333-8333-333333333333",
      owner_scope: "end_user",
      owner_id: "55555555-5555-4555-8555-555555555555",
      provider: "stripe",
      provider_checkout_session_id: "cs_test_123",
      amount_usd: "5.00000000",
      status: "credited",
      created_at: "2026-06-17T00:00:00.000Z",
      updated_at: "2026-06-17T00:00:00.000Z"
    }
  ],
  payouts: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      developer_id: "22222222-2222-4222-8222-222222222222",
      developer_name: "Demo Developer",
      amount_usd: "1.25000000",
      status: "pending",
      provider: "mock",
      created_at: "2026-06-17T00:00:00.000Z",
      updated_at: "2026-06-17T00:00:00.000Z"
    }
  ],
  audit_logs: [
    {
      id: "77777777-7777-4777-8777-777777777777",
      actor_scope: "developer",
      action: "feature.create",
      resource_type: "app_feature",
      metadata: {
        public_app_id: "app_pub_demo"
      },
      created_at: "2026-06-17T00:00:00.000Z"
    }
  ]
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("dashboard app", () => {
  it("documents the client-side provider key boundary", () => {
    expect(dashboardApp.providerKeyBoundary).toBe("no-provider-secrets-in-client");
  });

  it("fetches usage dashboard data from the API", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(dashboardResponse));

    await expect(fetchUsageDashboard(fetcher, "http://api.test", "app_pub_demo")).resolves.toEqual(
      dashboardResponse
    );
    expect(fetcher).toHaveBeenCalledWith("http://api.test/v1/apps/app_pub_demo/usage");
  });

  it("fetches developer provider keys with admin authorization", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(providerKeysResponse));

    await expect(
      fetchDeveloperProviderKeys(fetcher, "http://api.test", "app_pub_demo", "mf_admin_dev")
    ).resolves.toEqual(providerKeysResponse.items);

    expect(fetcher).toHaveBeenCalledWith(
      "http://api.test/v1/developer/provider-keys?public_app_id=app_pub_demo",
      {
        headers: {
          authorization: "Bearer mf_admin_dev"
        }
      }
    );
  });

  it("fetches developer apps with admin authorization", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(appsResponse));

    await expect(fetchDeveloperApps(fetcher, "http://api.test", "mf_admin_dev")).resolves.toEqual(
      appsResponse.items
    );

    expect(fetcher).toHaveBeenCalledWith("http://api.test/v1/developer/apps", {
      headers: {
        authorization: "Bearer mf_admin_dev"
      }
    });
  });

  it("renders overview totals", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(dashboardResponse));

    render(<App fetcher={fetcher} initialPath="/dashboard" />);

    await waitFor(() => {
      expect(screen.getByText("Total calls")).toBeTruthy();
    });
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("80")).toBeTruthy();
    expect(screen.getByText("$0.001300")).toBeTruthy();
    expect(screen.getAllByText("$0.000520").length).toBeGreaterThan(0);
  });

  it("renders the app usage table", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(dashboardResponse));

    render(<App fetcher={fetcher} initialPath="/apps/app_pub_demo/usage" />);

    await waitFor(() => {
      expect(screen.getByText("req_123")).toBeTruthy();
    });
    expect(screen.getAllByText("customer_reply").length).toBeGreaterThan(0);
  });

  it("renders revenue totals", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(dashboardResponse));

    render(<App fetcher={fetcher} initialPath="/revenue" />);

    await waitFor(() => {
      expect(screen.getByText("Developer revenue")).toBeTruthy();
    });
    expect(screen.getAllByText("$0.000520").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$0.000780").length).toBeGreaterThan(0);
  });

  it("renders developer provider keys and clears the raw key after submit", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/usage")) {
        return jsonResponse(dashboardResponse);
      }

      if (init?.method === "POST") {
        return jsonResponse(
          {
            id: "33333333-3333-3333-3333-333333333333",
            provider: "openrouter",
            masked: "sk-...wxyz",
            status: "active",
            models_allowed: ["openrouter/auto"],
            priority: 1,
            budget_limit_usd: "2.00000000",
            fallback_to_platform: true
          },
          201
        );
      }

      return jsonResponse(providerKeysResponse);
    });

    render(
      <App
        apiBaseUrl="http://api.test"
        developerAdminToken="mf_admin_dev"
        fetcher={fetcher}
        initialPath="/provider-keys"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("sk-...abcd")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Provider"), {
      target: { value: "openrouter" }
    });
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-test-provider-secret-wxyz" }
    });
    fireEvent.change(screen.getByLabelText("Models"), {
      target: { value: "openrouter/auto" }
    });
    fireEvent.change(screen.getByLabelText("Budget USD"), {
      target: { value: "2.00" }
    });

    fireEvent.click(screen.getByText("Save key"));

    await waitFor(() => {
      expect(screen.getByText("Provider key saved.")).toBeTruthy();
    });

    const postCall = fetcher.mock.calls.find(
      ([input, init]) => String(input) === "http://api.test/v1/developer/provider-keys" && init?.method === "POST"
    );
    expect(postCall).toBeDefined();
    expect(postCall?.[1]?.headers).toEqual({
      authorization: "Bearer mf_admin_dev",
      "content-type": "application/json"
    });
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      public_app_id: "app_pub_demo",
      provider: "openrouter",
      api_key: "sk-test-provider-secret-wxyz",
      models_allowed: ["openrouter/auto"],
      budget_limit_usd: "2.00"
    });
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("sk-test-provider-secret-wxyz")).toBeNull();
  });

  it("renders the apps console and creates an app", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/usage")) {
        return jsonResponse(dashboardResponse);
      }

      if (url.endsWith("/v1/developer/apps") && init?.method === "POST") {
        return jsonResponse(
          {
            ...appsResponse.items[0],
            public_app_id: "app_pub_support",
            name: "Support Console",
            default_revenue_share_bps: 4200
          },
          201
        );
      }

      return jsonResponse(appsResponse);
    });

    render(
      <App
        apiBaseUrl="http://api.test"
        developerAdminToken="mf_admin_dev"
        fetcher={fetcher}
        initialPath="/apps"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("app_pub_demo")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("Public app ID"), {
      target: { value: "app_pub_support" }
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Support Console" }
    });
    fireEvent.change(screen.getByLabelText("Vertical"), {
      target: { value: "support" }
    });
    fireEvent.change(screen.getByLabelText("Revenue bps"), {
      target: { value: "4200" }
    });
    fireEvent.click(screen.getByText("Create app"));

    await waitFor(() => {
      expect(screen.getByText("App created.")).toBeTruthy();
    });

    const postCall = fetcher.mock.calls.find(
      ([input, init]) => String(input) === "http://api.test/v1/developer/apps" && init?.method === "POST"
    );
    expect(postCall).toBeDefined();
    expect(postCall?.[1]?.headers).toEqual({
      authorization: "Bearer mf_admin_dev",
      "content-type": "application/json"
    });
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      public_app_id: "app_pub_support",
      name: "Support Console",
      vertical: "support",
      default_revenue_share_bps: 4200,
      status: "active"
    });
  });

  it("renders feature policy editing and reports invalid JSON", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/usage")) {
        return jsonResponse(dashboardResponse);
      }

      return jsonResponse(featureResponse);
    });

    render(
      <App
        apiBaseUrl="http://api.test"
        developerAdminToken="mf_admin_dev"
        fetcher={fetcher}
        initialPath="/features"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("customer_reply").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText("Feature key"), {
      target: { value: "ticket_summary" }
    });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Ticket summary" }
    });
    fireEvent.change(screen.getByLabelText("Policy JSON"), {
      target: { value: "{invalid" }
    });
    fireEvent.click(screen.getByText("Create feature"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(
      fetcher.mock.calls.some(
        ([input, init]) => String(input).includes("/features") && init?.method === "POST"
      )
    ).toBe(false);
  });

  it("renders operations wallet, payout, top-up, and audit data", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/usage")) {
        return jsonResponse(dashboardResponse);
      }

      return jsonResponse(operationsResponse);
    });

    render(
      <App
        apiBaseUrl="http://api.test"
        developerAdminToken="mf_admin_dev"
        fetcher={fetcher}
        initialPath="/operations"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("Demo Developer").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("$1.250000").length).toBeGreaterThan(0);
    expect(screen.getByText("feature.create")).toBeTruthy();
    expect(screen.getByText("stripe")).toBeTruthy();
  });
});
