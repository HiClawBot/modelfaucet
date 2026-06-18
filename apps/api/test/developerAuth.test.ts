import { describe, expect, it, vi } from "vitest";
import { buildApiServer, hashDeveloperApiToken } from "../src/index";
import type {
  CreateVirtualSessionResult,
  DeveloperAuthRepository,
  DeveloperConsoleRepository,
  SessionRepository
} from "../src/index";

const unusedSessionRepository: SessionRepository = {
  async createVirtualSession(): Promise<CreateVirtualSessionResult> {
    throw new Error("not used");
  }
};

function developerConsoleNoops(): DeveloperConsoleRepository {
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

function tokenNoops(): DeveloperAuthRepository {
  return {
    async authenticateToken() {
      throw new Error("not used");
    },
    async createToken() {
      throw new Error("not used");
    },
    async listTokens() {
      return [];
    },
    async revokeToken() {
      throw new Error("not used");
    }
  };
}

describe("developer API token auth", () => {
  it("authenticates scoped developer tokens and filters app listing", async () => {
    const authenticateToken = vi.fn<DeveloperAuthRepository["authenticateToken"]>(
      async (tokenHash, authenticatedAt) => {
        expect(tokenHash).toBe(hashDeveloperApiToken("mf_dev_tenant"));
        expect(authenticatedAt).toEqual(new Date("2026-06-17T00:00:00.000Z"));
        return {
          authMethod: "developer_token",
          developerId: "22222222-2222-4222-8222-222222222222",
          developerEmail: "dev@example.com",
          scopes: ["developer:apps:read"]
        };
      }
    );
    const listApps = vi.fn<DeveloperConsoleRepository["listApps"]>(
      async (developerId) => {
        expect(developerId).toBe("22222222-2222-4222-8222-222222222222");
        return [
          {
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
          }
        ];
      }
    );
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      developerAuthRepository: {
        ...tokenNoops(),
        authenticateToken
      },
      developerConsoleRepository: {
        ...developerConsoleNoops(),
        listApps
      },
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/developer/apps",
      headers: {
        authorization: "Bearer mf_dev_tenant"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          public_app_id: "app_pub_console"
        }
      ]
    });
    expect(authenticateToken).toHaveBeenCalledOnce();
    expect(listApps).toHaveBeenCalledOnce();
  });

  it("rejects developer tokens that lack the required scope", async () => {
    const createApp = vi.fn<DeveloperConsoleRepository["createApp"]>();
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      developerAuthRepository: {
        ...tokenNoops(),
        async authenticateToken() {
          return {
            authMethod: "developer_token",
            developerId: "22222222-2222-4222-8222-222222222222",
            developerEmail: "dev@example.com",
            scopes: ["developer:apps:read"]
          };
        }
      },
      developerConsoleRepository: {
        ...developerConsoleNoops(),
        createApp
      },
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/developer/apps",
      headers: {
        authorization: "Bearer mf_dev_read_only"
      },
      payload: {
        public_app_id: "app_pub_console",
        name: "Console Demo"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "forbidden"
      }
    });
    expect(createApp).not.toHaveBeenCalled();
  });

  it("creates developer API tokens with hashed storage and one-time raw token return", async () => {
    const createToken = vi.fn<DeveloperAuthRepository["createToken"]>(async (input) => {
      expect(input).toMatchObject({
        developerId: "22222222-2222-4222-8222-222222222222",
        name: "ci token",
        tokenHash: hashDeveloperApiToken("mf_dev_fixedtokenabcdef"),
        tokenPrefix: "mf_dev_fixedtok",
        scopes: ["developer:apps:read"]
      });
      return {
        id: "11111111-1111-4111-8111-111111111111",
        developer_id: "22222222-2222-4222-8222-222222222222",
        developer_name: "Demo Developer",
        developer_email: "dev@example.com",
        name: input.name,
        token_prefix: input.tokenPrefix,
        scopes: input.scopes,
        status: "active",
        created_at: "2026-06-17T00:00:00.000Z",
        updated_at: "2026-06-17T00:00:00.000Z"
      };
    });
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      developerAuthRepository: {
        ...tokenNoops(),
        createToken
      },
      developerAdminToken: "mf_admin_dev",
      developerTokenFactory: () => "mf_dev_fixedtokenabcdef",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/developer/tokens",
      headers: {
        authorization: "Bearer mf_admin_dev"
      },
      payload: {
        developer_id: "22222222-2222-4222-8222-222222222222",
        name: "ci token",
        scopes: ["developer:apps:read"]
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).toContain("mf_dev_fixedtokenabcdef");
    expect(response.body).not.toContain(hashDeveloperApiToken("mf_dev_fixedtokenabcdef"));
    expect(response.body).not.toContain("token_hash");
    expect(response.json()).toMatchObject({
      token: "mf_dev_fixedtokenabcdef",
      item: {
        token_prefix: "mf_dev_fixedtok",
        scopes: ["developer:apps:read"]
      }
    });
    expect(createToken).toHaveBeenCalledOnce();
  });

  it("prevents developer tokens from managing another developer token", async () => {
    const createToken = vi.fn<DeveloperAuthRepository["createToken"]>();
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      developerAuthRepository: {
        ...tokenNoops(),
        async authenticateToken() {
          return {
            authMethod: "developer_token",
            developerId: "22222222-2222-4222-8222-222222222222",
            developerEmail: "dev@example.com",
            scopes: ["developer:tokens:write"]
          };
        },
        createToken
      },
      developerTokenFactory: () => "mf_dev_fixedtokenabcdef",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/developer/tokens",
      headers: {
        authorization: "Bearer mf_dev_tenant"
      },
      payload: {
        developer_id: "33333333-3333-4333-8333-333333333333",
        name: "other developer token",
        scopes: ["developer:apps:read"]
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "forbidden"
      }
    });
    expect(createToken).not.toHaveBeenCalled();
  });
});
