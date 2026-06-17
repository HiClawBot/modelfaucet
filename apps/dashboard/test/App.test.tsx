// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { fetchDeveloperProviderKeys, fetchUsageDashboard } from "../src/api";
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
});
