# ModelFaucet 施工文档

版本：v0.1 Draft  
日期：2026-06-17  
目标读者：Codex、工程团队、技术负责人、DevOps、产品负责人

---

## 0. 施工目标

把 ModelFaucet 从设计文档落成一个可运行的 MVP。

MVP 必须跑通以下闭环：

```txt
第三方 demo app 嵌入 SDK
-> end user 不填写 API key
-> SDK 创建短期 session
-> Gateway 调用 LLM
-> usage_events 写入 token 用量
-> rating engine 计算成本、售价、毛利、渠道分成
-> ledger_entries 写入钱包流水
-> developer dashboard 展示收益
```

MVP 第二阶段加入：

```txt
- end user BYOK
- 本地 / 局域网模型 Local Bridge
- 开发者自带 provider keys
- Stripe test mode 充值与 payout mock
```

---

## 1. 项目命名

正式工程名：**ModelFaucet**  
仓库名建议：`modelfaucet`  
包名建议：

```txt
@modelfaucet/sdk
@modelfaucet/react
@modelfaucet/shared
modelfaucet-local-bridge
```

正式发布前检查：

```txt
- npm package 是否可用
- GitHub organization 是否可用
- PyPI / crates.io / Homebrew tap 是否需要
- Docker namespace 是否可用
- 商标风险
```

---

## 2. 技术栈决策

### 2.1 Monorepo

使用：

```txt
pnpm workspace
Turborepo 可选
TypeScript strict mode
ESLint + Prettier
Vitest
Playwright 可选
```

### 2.2 后端

推荐：

```txt
Fastify + TypeScript
Zod for validation
Prisma 或 Drizzle ORM
PostgreSQL
Redis
BullMQ
OpenTelemetry
```

Fastify 足够轻，适合 API 和 Gateway；如果团队偏企业风格，可换 NestJS，但 MVP 不必过重。

### 2.3 LLM 路由

第一版不要重写所有 provider adapter。使用 LiteLLM Proxy 作为底层 provider router：

```txt
ModelFaucet Gateway
-> LiteLLM Proxy
-> OpenAI / Anthropic / Gemini / OpenRouter / Azure / Bedrock / etc.
```

ModelFaucet 自己实现：

```txt
- app/channel attribution
- session broker
- revenue ledger
- BYOK UX
- local bridge
- settlement
```

### 2.4 Dashboard

推荐：

```txt
Next.js App Router
Tailwind CSS
shadcn/ui 可选
React Query / TanStack Query
```

### 2.5 Local Bridge

推荐 Go 起步：

```txt
Go 1.22+
net/http
OpenAI-compatible proxy
local config file
system tray 后续再做
```

Rust 也可，但 Go 更快落地。

---

## 3. 仓库结构

Codex 应创建如下结构：

```txt
modelfaucet/
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .env.example
  docker-compose.yml

  apps/
    api/
      package.json
      src/
        index.ts
        server.ts
        env.ts
        routes/
        services/
        repositories/
        plugins/
      test/

    gateway/
      package.json
      src/
        index.ts
        server.ts
        routes/
        router/
        proxy/
        usage/
        auth/
      test/

    dashboard/
      package.json
      app/
      components/
      lib/

  packages/
    shared/
      package.json
      src/
        types.ts
        schemas.ts
        errors.ts
        pricing.ts

    sdk-js/
      package.json
      src/
        index.ts
        client.ts
        sessions.ts
        chat.ts
        byok.ts
        local.ts
      test/

    react/
      package.json
      src/
        FaucetProvider.tsx
        FaucetChat.tsx
        FaucetBYOKSettings.tsx
        FaucetLocalModelSettings.tsx
        FaucetBuyCredits.tsx

  services/
    rating-worker/
      package.json
      src/
        index.ts
        rateUsage.ts

    settlement-worker/
      package.json
      src/
        index.ts

    local-bridge/
      go.mod
      cmd/modelfaucet-bridge/main.go
      internal/config/
      internal/proxy/
      internal/usage/

  infra/
    db/
      schema.sql
      migrations/
        0001_init.sql
    docker/
      litellm.config.yaml

  examples/
    crm-demo/
      package.json
      src/

  docs/
    WHITEPAPER.md
    CONSTRUCTION.md
    API_SPEC.md
    SECURITY.md
    CODEX_TASKS.md
```

---

## 4. 环境变量

`.env.example` 必须包含：

```env
NODE_ENV=development
PORT_API=3001
PORT_GATEWAY=3002
DATABASE_URL=postgresql://modelfaucet:modelfaucet@localhost:5432/modelfaucet
REDIS_URL=redis://localhost:6379

JWT_SECRET=dev_only_replace_me
SESSION_TOKEN_TTL_SECONDS=3600

LITELLM_BASE_URL=http://localhost:4000
LITELLM_MASTER_KEY=sk-litellm-dev-master-key

# First platform provider route for local MVP.
# Never expose this to clients.
OPENAI_API_KEY=
OPENROUTER_API_KEY=

# Encryption. Dev mode can use a local key; production must use KMS/Vault.
SECRET_ENCRYPTION_KEY=dev_32_bytes_replace_me_replace_me

# Stripe test mode, optional for phase 5.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=
```

---

## 5. Docker Compose

本地依赖：

```txt
postgres
redis
litellm
```

`docker-compose.yml` 应暴露：

```txt
Postgres: 5432
Redis:    6379
LiteLLM:  4000
```

LiteLLM 配置文件：`infra/docker/litellm.config.yaml`

第一版可把 `gpt-4.1-mini`、`openrouter/auto` 或任意可用 provider 配成 `model_name: auto-text`。注意真实 key 来自服务端环境变量，不写入客户端。

---

## 6. 数据库施工

执行 `infra/db/schema.sql`，创建以下核心表：

```txt
developers
apps
app_features
end_users
provider_credentials
virtual_sessions
usage_events
wallets
ledger_entries
payouts
audit_logs
```

### 6.1 关键要求

```txt
- external_user_id 只保存 hash，不保存明文
- provider API key 只保存 encrypted_secret_ref 或密文，不回显
- usage_events 是事实表，不允许随意改写
- ledger_entries 是财务表，必须可审计
- 所有金额使用 numeric(18,8)
- request_id 必须唯一
```

### 6.2 种子数据

开发环境 seed：

```txt
Developer: Demo Developer
App: CRM Demo
public_app_id: app_pub_demo
Feature: customer_reply
End user wallet: $10.00 test credits
Revenue share: channel 40%, platform 60%
```

---

## 7. 后端 API 施工

### 7.1 apps/api

职责：控制面。

必须实现：

```txt
POST /v1/developers
POST /v1/apps
GET  /v1/apps/:app_id
POST /v1/apps/:app_id/features
POST /v1/sessions
POST /v1/user/provider-keys
GET  /v1/user/provider-keys
DELETE /v1/user/provider-keys/:id
GET  /v1/apps/:app_id/usage
GET  /v1/developers/:developer_id/revenue
GET  /health
```

### 7.2 apps/gateway

职责：OpenAI-compatible 请求入口。

必须实现：

```txt
POST /v1/chat/completions
GET  /health
```

Phase 2 加：

```txt
POST /v1/responses
POST /v1/embeddings
```

### 7.3 gateway 请求流程

每次 `/v1/chat/completions`：

```txt
1. 读取 Authorization: Bearer mf_sess_xxx
2. 校验 virtual_sessions.token_hash
3. 检查 session 是否过期
4. 获取 app、developer、end_user、feature policy
5. 预算检查
6. selectRoute()
7. 转发到 LiteLLM 或 BYOK provider 或 Local Bridge
8. streaming 返回给客户端
9. 捕获 token usage
10. 写 usage_events
11. 调用 rating engine
12. 写 ledger_entries
```

---

## 8. SDK 施工

### 8.1 packages/sdk-js

公共 API：

```ts
createFaucet(options: FaucetOptions): FaucetClient
```

```ts
type FaucetOptions = {
  publicAppId: string;
  baseUrl?: string;
  gatewayBaseUrl?: string;
  user: {
    id: string;
    email?: string;
    metadata?: Record<string, unknown>;
  };
};
```

```ts
type FaucetClient = {
  chat(input: FaucetChatInput): Promise<FaucetChatResult>;
  stream(input: FaucetChatInput): AsyncIterable<FaucetStreamEvent>;
  createSession(): Promise<FaucetSession>;
  byok: {
    addKey(input: AddProviderKeyInput): Promise<void>;
    listKeys(): Promise<ProviderKeySummary[]>;
    deleteKey(id: string): Promise<void>;
  };
  local: {
    detectBridge(): Promise<LocalBridgeStatus>;
    listModels(): Promise<LocalModel[]>;
  };
};
```

### 8.2 React components

必须实现 headless-first，UI 可替换：

```tsx
<FaucetProvider publicAppId="app_pub_demo" userId={user.id}>
  <FaucetChat feature="customer_reply" />
  <FaucetBYOKSettings />
  <FaucetLocalModelSettings />
  <FaucetBuyCredits />
</FaucetProvider>
```

Phase 1 只需 `FaucetProvider` 和 `FaucetChat`。

---

## 9. Rating Engine 施工

文件：`services/rating-worker/src/rateUsage.ts`

函数：

```ts
export function rateUsage(event: UsageEvent, price: ModelPrice, rule: RevenueRule): RatedUsage
```

规则：

```txt
platform:
  upstream_cost = input * input_price + output * output_price + cached * cached_price
  retail_price = upstream_cost * (1 + markup_percent / 100)
  gross_margin = retail_price - upstream_cost
  channel_revenue = gross_margin * channel_share_bps / 10000
  platform_revenue = gross_margin - channel_revenue

developer_key:
  v0.1 可按 platform 一样处理，或设置 upstream_cost_to_platform = 0
  具体由 app pricing rule 决定

byok:
  upstream_cost_to_platform = 0
  retail_price = explicit gateway fee or 0
  no hidden token markup

local:
  upstream_cost_to_platform = 0
  retail_price = explicit local service fee or 0
```

测试用例：

```txt
- platform route with 30% markup, 40% channel share
- BYOK route returns zero upstream platform cost
- local route returns zero upstream platform cost
- negative tokens rejected
- unknown route rejected
```

---

## 10. Ledger 施工

文件：`apps/api/src/services/ledger.ts`

函数：

```ts
recordRatedUsage(ratedUsage: RatedUsage): Promise<void>
```

必须在数据库事务中：

```txt
1. insert usage_events
2. insert ledger debit from end_user_wallet
3. insert provider_cost credit
4. insert developer_wallet credit
5. insert platform_wallet credit
6. update wallet balances
```

要求：

```txt
- request_id 幂等
- 事务失败要回滚
- 金额不能浮点计算，使用 decimal library
- ledger_entries 不允许物理删除
```

---

## 11. BYOK 施工

### 11.1 添加 key

Endpoint：

```txt
POST /v1/user/provider-keys
```

流程：

```txt
1. session auth
2. validate provider/base_url
3. call provider test endpoint or low-cost models endpoint
4. encrypt key
5. insert provider_credentials
6. return masked summary
```

返回：

```json
{
  "id": "cred_123",
  "provider": "openai",
  "masked": "sk-...abcd",
  "status": "active"
}
```

### 11.2 调用 BYOK

路由优先级：

```txt
local if user selected local
else BYOK if user selected BYOK or feature policy byok_first
else developer key
else platform pool
```

BYOK 使用时：

```txt
- 不记录用户明文 key
- 不回显 key
- 不做隐藏 token markup
- 可以收明确 gateway fee
```

---

## 12. Local Bridge 施工

### 12.1 命令

```bash
modelfaucet-bridge start --port 8787 --config ~/.modelfaucet/bridge.yaml
```

### 12.2 Bridge API

```txt
GET  /health
GET  /models
POST /v1/chat/completions
POST /usage/report
```

### 12.3 配置

```yaml
endpoints:
  - id: ollama
    name: Ollama
    base_url: http://localhost:11434/v1
    api_key: ollama
    provider: openai_compatible

  - id: lmstudio
    name: LM Studio
    base_url: http://localhost:1234/v1
    api_key: lm-studio
    provider: openai_compatible

  - id: office-vllm
    name: Office vLLM
    base_url: http://192.168.1.20:8000/v1
    api_key: token-abc123
    provider: openai_compatible
```

### 12.4 安全要求

```txt
- Cloud gateway 不访问用户 LAN endpoint
- Bridge 默认只监听 127.0.0.1
- 若监听 0.0.0.0，必须配置 auth token
- Bridge 不默认上传 prompt 内容，只上传 usage metadata
```

---

## 13. Dashboard 施工

页面：

```txt
/dashboard
  Overview: calls, tokens, revenue, error rate

/apps
  App list, create app

/apps/:id
  App detail, public_app_id, feature manifest, settings

/apps/:id/usage
  Usage events table

/revenue
  Developer wallet, pending payout, historical earnings

/provider-keys
  Developer provider keys

/settings
  payout settings, team settings
```

Phase 1 最少实现：

```txt
- app detail
- usage table
- revenue summary
```

---

## 14. 测试策略

### 14.1 Unit tests

```txt
packages/shared: schemas, pricing helpers
services/rating-worker: rateUsage
apps/api: session, ledger
apps/gateway: route selection
packages/sdk-js: session, chat client
```

### 14.2 Integration tests

使用 docker compose：

```txt
- create developer/app/user
- create session
- mock LiteLLM response
- call gateway
- assert usage event
- assert ledger entries
```

### 14.3 Security tests

```txt
- client bundle does not contain provider keys
- expired session rejected
- invalid app rejected
- private network URL rejected by cloud API
- BYOK key never returned in response
```

---

## 15. CI/CD

GitHub Actions：

```txt
pull_request:
  pnpm install
  pnpm lint
  pnpm typecheck
  pnpm test
  docker compose up -d postgres redis
  pnpm test:integration

main:
  build docker images
  publish canary packages if tagged
```

---

## 16. 发布顺序

### 16.1 内部 Alpha

```txt
- 私有 GitHub 仓库
- 本地 docker compose
- 一个 CRM demo
- 一个真实 provider key
- 只给内部用户测试
```

### 16.2 开源 Beta

```txt
- 发布 SDK
- 发布 Gateway/API/Dashboard 源码
- 文档站
- 示例应用
- 明确安全声明
```

### 16.3 托管服务

```txt
- hosted gateway
- developer console
- Stripe test -> live
- payout onboarding
- abuse prevention
```

---

## 17. Codex 工作方式

建议每次只让 Codex 做一个小任务，并要求它提交测试。

推荐顺序：

```txt
1. Bootstrap monorepo
2. Add database schema and seed
3. Build apps/api health and session endpoint
4. Build apps/gateway OpenAI-compatible endpoint with mock provider
5. Add LiteLLM proxy integration
6. Add usage event write
7. Add rating engine
8. Add ledger transaction
9. Add SDK createSession/chat
10. Add CRM demo
11. Add dashboard usage/revenue pages
12. Add BYOK key storage and verification
13. Add Local Bridge
14. Add Stripe test mode credits
```

每个 PR 必须包含：

```txt
- 代码
- 测试
- 文档更新
- 本地运行说明
- 安全影响说明
```

---

## 18. 完成定义

MVP 完成的定义：

```txt
[ ] docker compose 一键启动依赖
[ ] pnpm dev 启动 API/Gateway/Dashboard
[ ] CRM demo 可调用 AI
[ ] usage_events 正确记录 token
[ ] ledger_entries 正确记录分账
[ ] developer dashboard 可看到收益
[ ] BYOK 可添加、删除、调用
[ ] Local Bridge 可调用 Ollama 或 vLLM
[ ] 所有真实 provider keys 不出服务端
[ ] README 可让新开发者 15 分钟跑通 demo
```
