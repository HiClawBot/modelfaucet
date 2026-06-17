import { describe, expect, it, vi } from "vitest";
import { buildApiServer } from "../src/index";
import type {
  CreateVirtualSessionResult,
  DeveloperConsoleRepository,
  SessionRepository
} from "../src/index";

const unusedSessionRepository: SessionRepository = {
  async createVirtualSession(): Promise<CreateVirtualSessionResult> {
    throw new Error("not used");
  }
};

const appSummary = {
  public_app_id: "app_pub_console",
  name: "Console Demo",
  vertical: "crm",
  default_revenue_share_bps: 4200,
  status: "active",
  developer_id: "22222222-2222-4222-8222-222222222222",
  developer_name: "Demo Developer",
  developer_email: "dev@example.com",
  created_at: "2026-06-17T00:00:00.000Z",
  updated_at: "2026-06-17T00:00:00.000Z"
};

const featureSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  public_app_id: "app_pub_console",
  feature_key: "reply",
  display_name: "Reply generation",
  policy: {
    route_preference: ["local", "developer_key", "platform_pool"]
  },
  pricing: {
    mode: "usage_markup",
    markup_percent: 30,
    channel_share_bps: 4200
  },
  created_at: "2026-06-17T00:00:00.000Z",
  updated_at: "2026-06-17T00:00:00.000Z"
};

function repositoryNoops(): DeveloperConsoleRepository {
  return {
    async listApps() {
      throw new Error("not used");
    },
    async createApp() {
      throw new Error("not used");
    },
    async updateApp() {
      throw new Error("not used");
    },
    async archiveApp() {
      throw new Error("not used");
    },
    async listFeatures() {
      throw new Error("not used");
    },
    async createFeature() {
      throw new Error("not used");
    },
    async updateFeature() {
      throw new Error("not used");
    },
    async deleteFeature() {
      throw new Error("not used");
    },
    async getOperations() {
      throw new Error("not used");
    }
  };
}

describe("developer console routes", () => {
  it("requires developer admin auth for app listing", async () => {
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      developerConsoleRepository: repositoryNoops(),
      developerAdminToken: "mf_admin_dev",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/developer/apps"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_session"
      }
    });
  });

  it("creates, updates, and archives developer apps", async () => {
    const createApp = vi.fn<DeveloperConsoleRepository["createApp"]>(async (input) => {
      expect(input).toEqual({
        publicAppId: "app_pub_console",
        name: "Console Demo",
        vertical: "crm",
        defaultRevenueShareBps: 4200,
        status: "active",
        now: new Date("2026-06-17T00:00:00.000Z")
      });
      return appSummary;
    });
    const updateApp = vi.fn<DeveloperConsoleRepository["updateApp"]>(async (input) => {
      expect(input).toEqual({
        publicAppId: "app_pub_console",
        name: "Updated Demo",
        vertical: undefined,
        defaultRevenueShareBps: undefined,
        status: "active",
        now: new Date("2026-06-17T00:00:00.000Z")
      });
      return {
        ...appSummary,
        name: "Updated Demo"
      };
    });
    const archiveApp = vi.fn<DeveloperConsoleRepository["archiveApp"]>(
      async (publicAppId, now) => {
        expect(publicAppId).toBe("app_pub_console");
        expect(now).toEqual(new Date("2026-06-17T00:00:00.000Z"));
        return {
          ...appSummary,
          status: "disabled"
        };
      }
    );
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      developerConsoleRepository: {
        ...repositoryNoops(),
        createApp,
        updateApp,
        archiveApp
      },
      developerAdminToken: "mf_admin_dev",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const created = await server.inject({
      method: "POST",
      url: "/v1/developer/apps",
      headers: {
        authorization: "Bearer mf_admin_dev"
      },
      payload: {
        public_app_id: "app_pub_console",
        name: "Console Demo",
        vertical: "crm",
        default_revenue_share_bps: 4200
      }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      public_app_id: "app_pub_console",
      name: "Console Demo"
    });

    const updated = await server.inject({
      method: "PATCH",
      url: "/v1/developer/apps/app_pub_console",
      headers: {
        authorization: "Bearer mf_admin_dev"
      },
      payload: {
        name: "Updated Demo",
        status: "active"
      }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      name: "Updated Demo"
    });

    const archived = await server.inject({
      method: "DELETE",
      url: "/v1/developer/apps/app_pub_console",
      headers: {
        authorization: "Bearer mf_admin_dev"
      }
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({
      status: "disabled"
    });
    expect(createApp).toHaveBeenCalledOnce();
    expect(updateApp).toHaveBeenCalledOnce();
    expect(archiveApp).toHaveBeenCalledOnce();
  });

  it("manages feature manifests without provider secrets", async () => {
    const listFeatures = vi.fn<DeveloperConsoleRepository["listFeatures"]>(
      async (publicAppId) => {
        expect(publicAppId).toBe("app_pub_console");
        return [featureSummary];
      }
    );
    const createFeature = vi.fn<DeveloperConsoleRepository["createFeature"]>(
      async (input) => {
        expect(input).toMatchObject({
          publicAppId: "app_pub_console",
          featureKey: "reply",
          displayName: "Reply generation",
          policy: {
            route_preference: ["local", "developer_key", "platform_pool"]
          }
        });
        return featureSummary;
      }
    );
    const updateFeature = vi.fn<DeveloperConsoleRepository["updateFeature"]>(
      async (input) => {
        expect(input).toMatchObject({
          publicAppId: "app_pub_console",
          featureKey: "reply",
          displayName: "Updated reply"
        });
        return {
          ...featureSummary,
          display_name: "Updated reply"
        };
      }
    );
    const deleteFeature = vi.fn<DeveloperConsoleRepository["deleteFeature"]>(
      async (publicAppId, featureKey) => {
        expect(publicAppId).toBe("app_pub_console");
        expect(featureKey).toBe("reply");
      }
    );
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      developerConsoleRepository: {
        ...repositoryNoops(),
        listFeatures,
        createFeature,
        updateFeature,
        deleteFeature
      },
      developerAdminToken: "mf_admin_dev",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const listed = await server.inject({
      method: "GET",
      url: "/v1/developer/apps/app_pub_console/features",
      headers: {
        authorization: "Bearer mf_admin_dev"
      }
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.body).not.toContain("api_key");
    expect(listed.json()).toEqual({
      items: [featureSummary]
    });

    const created = await server.inject({
      method: "POST",
      url: "/v1/developer/apps/app_pub_console/features",
      headers: {
        authorization: "Bearer mf_admin_dev"
      },
      payload: {
        feature_key: "reply",
        display_name: "Reply generation",
        policy: {
          route_preference: ["local", "developer_key", "platform_pool"]
        },
        pricing: {
          mode: "usage_markup",
          markup_percent: 30,
          channel_share_bps: 4200
        }
      }
    });
    expect(created.statusCode).toBe(201);

    const updated = await server.inject({
      method: "PATCH",
      url: "/v1/developer/apps/app_pub_console/features/reply",
      headers: {
        authorization: "Bearer mf_admin_dev"
      },
      payload: {
        display_name: "Updated reply"
      }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      display_name: "Updated reply"
    });

    const deleted = await server.inject({
      method: "DELETE",
      url: "/v1/developer/apps/app_pub_console/features/reply",
      headers: {
        authorization: "Bearer mf_admin_dev"
      }
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });
    expect(createFeature).toHaveBeenCalledOnce();
    expect(updateFeature).toHaveBeenCalledOnce();
    expect(deleteFeature).toHaveBeenCalledOnce();
  });

  it("returns wallet, top-up, payout, and audit summaries", async () => {
    const getOperations = vi.fn<DeveloperConsoleRepository["getOperations"]>(
      async () => ({
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
              public_app_id: "app_pub_console"
            },
            created_at: "2026-06-17T00:00:00.000Z"
          }
        ]
      })
    );
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      developerConsoleRepository: {
        ...repositoryNoops(),
        getOperations
      },
      developerAdminToken: "mf_admin_dev",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/developer/operations",
      headers: {
        authorization: "Bearer mf_admin_dev"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("api_key");
    expect(response.json()).toMatchObject({
      wallets: [
        {
          owner_scope: "developer",
          balance_usd: "1.25000000"
        }
      ],
      payouts: [
        {
          status: "pending"
        }
      ],
      audit_logs: [
        {
          action: "feature.create"
        }
      ]
    });
    expect(getOperations).toHaveBeenCalledOnce();
  });
});
