import { describe, expect, it, vi } from "vitest";
import {
  buildApiServer,
  decryptSecret,
  hashSessionToken,
  validateBasicProviderKey
} from "../src/index";
import type {
  CreateDeveloperProviderKeyInput,
  CreateUserProviderKeyInput,
  CreateVirtualSessionResult,
  ProviderKeyRepository,
  SessionRepository
} from "../src/index";

const secretEncryptionKey = "dev_32_bytes_replace_me_replace_me";

const unusedSessionRepository: SessionRepository = {
  async createVirtualSession(): Promise<CreateVirtualSessionResult> {
    throw new Error("not used");
  }
};

function developerNoops(): Pick<
  ProviderKeyRepository,
  "createDeveloperProviderKey" | "listDeveloperProviderKeys" | "disableDeveloperProviderKey"
> {
  return {
    async createDeveloperProviderKey() {
      throw new Error("not used");
    },
    async listDeveloperProviderKeys() {
      return [];
    },
    async disableDeveloperProviderKey() {
      throw new Error("not used");
    }
  };
}

describe("provider key routes", () => {
  it("stores encrypted BYOK keys and returns only masked summaries", async () => {
    let captured: CreateUserProviderKeyInput | undefined;
    const providerKeyRepository: ProviderKeyRepository = {
      async createUserProviderKey(input) {
        captured = input;
        return {
          id: "11111111-1111-1111-1111-111111111111",
          provider: input.provider,
          base_url: input.baseUrl,
          masked: input.maskedSecret,
          status: "active",
          models_allowed: input.modelsAllowed,
          priority: input.priority,
          budget_limit_usd: input.budgetLimitUsd,
          fallback_to_platform: input.fallbackToPlatform
        };
      },
      async listUserProviderKeys() {
        return [];
      },
      async disableUserProviderKey() {
        throw new Error("not used");
      },
      ...developerNoops()
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      providerKeyRepository,
      secretEncryptionKey,
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });
    const rawKey = "sk-test-provider-key-abcd";

    const response = await server.inject({
      method: "POST",
      url: "/v1/user/provider-keys",
      headers: {
        authorization: "Bearer mf_sess_test"
      },
      payload: {
        provider: "openai",
        api_key: rawKey,
        base_url: "https://api.openai.com/v1",
        models_allowed: ["gpt-4.1-mini"],
        priority: 1,
        fallback_to_platform: false
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain(rawKey);
    expect(response.json()).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      provider: "openai",
      base_url: "https://api.openai.com/v1",
      masked: "sk-...abcd",
      status: "active",
      models_allowed: ["gpt-4.1-mini"],
      priority: 1,
      fallback_to_platform: false
    });

    expect(captured?.sessionTokenHash).toBe(hashSessionToken("mf_sess_test"));
    expect(captured?.encryptedSecretRef).not.toContain(rawKey);
    expect(captured?.encryptedSecretRef.startsWith("mfenc:v1:")).toBe(true);
    expect(decryptSecret(captured?.encryptedSecretRef ?? "", secretEncryptionKey)).toBe(
      rawKey
    );
    expect(captured?.maskedSecret).toBe("sk-...abcd");
  });

  it("lists BYOK keys without raw secrets", async () => {
    const providerKeyRepository: ProviderKeyRepository = {
      async createUserProviderKey() {
        throw new Error("not used");
      },
      async listUserProviderKeys(sessionTokenHash) {
        expect(sessionTokenHash).toBe(hashSessionToken("mf_sess_test"));
        return [
          {
            id: "11111111-1111-1111-1111-111111111111",
            provider: "openai",
            masked: "sk-...abcd",
            status: "active",
            models_allowed: ["gpt-4.1-mini"],
            priority: 1,
            fallback_to_platform: false
          }
        ];
      },
      async disableUserProviderKey() {
        throw new Error("not used");
      },
      ...developerNoops()
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      providerKeyRepository,
      secretEncryptionKey,
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/user/provider-keys",
      headers: {
        authorization: "Bearer mf_sess_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("api_key");
    expect(response.json()).toEqual({
      items: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          provider: "openai",
          masked: "sk-...abcd",
          status: "active",
          models_allowed: ["gpt-4.1-mini"],
          priority: 1,
          fallback_to_platform: false
        }
      ]
    });
  });

  it("disables BYOK keys", async () => {
    const disableUserProviderKey = vi.fn<ProviderKeyRepository["disableUserProviderKey"]>();
    const providerKeyRepository: ProviderKeyRepository = {
      async createUserProviderKey() {
        throw new Error("not used");
      },
      async listUserProviderKeys() {
        return [];
      },
      disableUserProviderKey,
      ...developerNoops()
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      providerKeyRepository,
      secretEncryptionKey,
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const response = await server.inject({
      method: "DELETE",
      url: "/v1/user/provider-keys/11111111-1111-1111-1111-111111111111",
      headers: {
        authorization: "Bearer mf_sess_test"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(disableUserProviderKey).toHaveBeenCalledWith(
      hashSessionToken("mf_sess_test"),
      "11111111-1111-1111-1111-111111111111",
      new Date("2026-06-17T00:00:00.000Z")
    );
  });

  it("rejects unsupported providers during basic validation", () => {
    expect(() => validateBasicProviderKey("unsupported", "sk-test-key")).toThrow(
      "Unsupported BYOK provider."
    );
  });

  it("rejects private provider base URLs before storage", async () => {
    const providerKeyRepository: ProviderKeyRepository = {
      async createUserProviderKey() {
        throw new Error("raw key should not reach storage");
      },
      async listUserProviderKeys() {
        return [];
      },
      async disableUserProviderKey() {
        throw new Error("not used");
      },
      ...developerNoops()
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      providerKeyRepository,
      secretEncryptionKey,
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/user/provider-keys",
      headers: {
        authorization: "Bearer mf_sess_test"
      },
      payload: {
        provider: "openai",
        api_key: "sk-test-provider-key",
        base_url: "http://127.0.0.1:11434/v1"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_request"
      }
    });
  });

  it("stores encrypted developer provider keys", async () => {
    let captured: CreateDeveloperProviderKeyInput | undefined;
    const providerKeyRepository: ProviderKeyRepository = {
      async createUserProviderKey() {
        throw new Error("not used");
      },
      async listUserProviderKeys() {
        return [];
      },
      async disableUserProviderKey() {
        throw new Error("not used");
      },
      async createDeveloperProviderKey(input) {
        captured = input;
        return {
          id: "22222222-2222-2222-2222-222222222222",
          provider: input.provider,
          base_url: input.baseUrl,
          masked: input.maskedSecret,
          status: "active",
          models_allowed: input.modelsAllowed,
          priority: input.priority,
          budget_limit_usd: input.budgetLimitUsd,
          fallback_to_platform: input.fallbackToPlatform
        };
      },
      async listDeveloperProviderKeys() {
        return [];
      },
      async disableDeveloperProviderKey() {
        throw new Error("not used");
      }
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      providerKeyRepository,
      secretEncryptionKey,
      developerAdminToken: "mf_admin_dev",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });
    const rawKey = "sk-or-developer-key-abcd";

    const response = await server.inject({
      method: "POST",
      url: "/v1/developer/provider-keys",
      headers: {
        authorization: "Bearer mf_admin_dev"
      },
      payload: {
        public_app_id: "app_pub_demo",
        provider: "openrouter",
        api_key: rawKey,
        base_url: "https://openrouter.ai/api/v1",
        models_allowed: ["openrouter/auto"],
        budget_limit_usd: "1.00",
        priority: 1,
        fallback_to_platform: true
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain(rawKey);
    expect(response.json()).toEqual({
      id: "22222222-2222-2222-2222-222222222222",
      provider: "openrouter",
      base_url: "https://openrouter.ai/api/v1",
      masked: "sk-...abcd",
      status: "active",
      models_allowed: ["openrouter/auto"],
      priority: 1,
      budget_limit_usd: "1.00",
      fallback_to_platform: true
    });
    expect(captured?.publicAppId).toBe("app_pub_demo");
    expect(captured?.encryptedSecretRef).not.toContain(rawKey);
    expect(decryptSecret(captured?.encryptedSecretRef ?? "", secretEncryptionKey)).toBe(
      rawKey
    );
  });

  it("requires developer admin auth for developer keys", async () => {
    const providerKeyRepository: ProviderKeyRepository = {
      async createUserProviderKey() {
        throw new Error("not used");
      },
      async listUserProviderKeys() {
        return [];
      },
      async disableUserProviderKey() {
        throw new Error("not used");
      },
      ...developerNoops()
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      providerKeyRepository,
      secretEncryptionKey,
      developerAdminToken: "mf_admin_dev",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/developer/provider-keys?public_app_id=app_pub_demo"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_session"
      }
    });
  });

  it("lists and disables developer keys", async () => {
    const disableDeveloperProviderKey = vi.fn<
      ProviderKeyRepository["disableDeveloperProviderKey"]
    >();
    const providerKeyRepository: ProviderKeyRepository = {
      async createUserProviderKey() {
        throw new Error("not used");
      },
      async listUserProviderKeys() {
        return [];
      },
      async disableUserProviderKey() {
        throw new Error("not used");
      },
      async createDeveloperProviderKey() {
        throw new Error("not used");
      },
      async listDeveloperProviderKeys(publicAppId) {
        expect(publicAppId).toBe("app_pub_demo");
        return [
          {
            id: "22222222-2222-2222-2222-222222222222",
            provider: "openai",
            masked: "sk-...abcd",
            status: "active",
            models_allowed: ["gpt-4.1-mini"],
            priority: 1,
            budget_limit_usd: "0.50",
            fallback_to_platform: false
          }
        ];
      },
      disableDeveloperProviderKey
    };
    const server = buildApiServer({
      sessionRepository: unusedSessionRepository,
      providerKeyRepository,
      secretEncryptionKey,
      developerAdminToken: "mf_admin_dev",
      gatewayBaseUrl: "http://localhost:3002/v1",
      sessionTokenTtlSeconds: 3600
    });

    const list = await server.inject({
      method: "GET",
      url: "/v1/developer/provider-keys?public_app_id=app_pub_demo",
      headers: {
        authorization: "Bearer mf_admin_dev"
      }
    });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain("api_key");
    expect(list.json()).toEqual({
      items: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          provider: "openai",
          masked: "sk-...abcd",
          status: "active",
          models_allowed: ["gpt-4.1-mini"],
          priority: 1,
          budget_limit_usd: "0.50",
          fallback_to_platform: false
        }
      ]
    });

    const deleted = await server.inject({
      method: "DELETE",
      url: "/v1/developer/provider-keys/22222222-2222-2222-2222-222222222222",
      headers: {
        authorization: "Bearer mf_admin_dev"
      }
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });
    expect(disableDeveloperProviderKey).toHaveBeenCalledWith(
      "22222222-2222-2222-2222-222222222222"
    );
  });
});
