<p align="center">
  <img src="assets/modelfaucet-logo.png" alt="ModelFaucet logo" width="220" />
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>简体中文</strong>
</p>

# ModelFaucet

**让每一款软件都成为 AI 的最后一公里渠道。**  
**中文名：模型水龙头。**

ModelFaucet 是一个开源 LLM 分发网关和可嵌入 SDK。它让网站、应用、插件、桌面软件或垂直 SaaS 能够以原生体验集成 AI 功能，同时自动记录 token 用量，并把收入分成归因到软件开发者或分发渠道。

> 状态：MVP 实现。当前本地栈包含 Control API、Gateway、Dashboard、SDK、React 包、CRM demo、Local Bridge、钱包余额、Stripe 测试模式充值和 payout mock。

---

## ModelFaucet 能做什么

ModelFaucet 把通常需要分别实现的六件事合在一起：

```txt
1. 可嵌入 AI SDK        在任意应用内添加 AI 功能。
2. LLM Gateway          通过统一 API 路由到云端模型提供商。
3. BYOK                 允许终端用户使用自己的 API key。
4. Local Bridge         支持 Ollama、vLLM、LM Studio 和局域网模型。
5. Usage Ledger         记录 token 用量、成本、价格和毛利。
6. Revenue Sharing      自动给渠道/开发者钱包记账。
```

它的目标不是再做一个通用聊天机器人，而是让每一个软件产品都能成为垂直 AI 能力的分发渠道。

---

## 核心思路

```txt
Third-party App
  -> ModelFaucet SDK
  -> Session Broker
  -> Faucet Gateway
  -> Provider Router / LiteLLM / Local Bridge
  -> Usage Ledger
  -> Rating Engine
  -> Developer Revenue Wallet
```

终端用户可以用三种方式使用 AI：

```txt
Default faucet mode:    不需要 API key。用户购买 credits 或使用内置额度。
BYOK mode:              用户输入自己的 provider API key。
Local mode:             用户把敏感任务路由到本地或局域网模型。
```

开发者可以把自己的应用配置成一个渠道：

```txt
- 创建 app
- 获取 public_app_id
- 嵌入 SDK
- 配置 feature manifest
- 选择 markup 和 revenue share
- 自动接收收入流水
```

---

## 为什么需要它

大多数 LLM 基础设施产品解决的是模型访问问题，但没有完整解决分发经济问题。

ModelFaucet 补上这一层：

```txt
LLM Gateway
+ vertical app SDK
+ end-user friendly AI UX
+ BYOK and local models
+ usage-based billing
+ channel attribution
+ automatic payout ledger
```

这样 CRM、helpdesk、电商后台、CMS、表格工具、浏览器插件或桌面应用，都可以成为 AI 分发端点，而不需要重新搭建 billing、key management、routing 和 token accounting。

---

## 架构

```txt
+---------------------------------------+
| Third-party App / Website / Plugin    |
| @modelfaucet/sdk + UI Components      |
+-------------------+-------------------+
                    |
                    v
+---------------------------------------+
| Session Broker                        |
| app auth, user hash, feature policy   |
| ephemeral session token               |
+-------------------+-------------------+
                    |
                    v
+---------------------------------------+
| Faucet Gateway                        |
| OpenAI-compatible /v1                 |
| routing, fallback, budget, streaming  |
+-------+-------------------+-----------+
        |                   |
        v                   v
+---------------+     +----------------+
| LiteLLM Proxy |     | Local Bridge   |
| Cloud LLMs    |     | Ollama/vLLM    |
+-------+-------+     +-------+--------+
        |                     |
        v                     v
+---------------------------------------+
| Usage Meter + Rating Engine           |
| token count, cost, price, margin      |
+-------------------+-------------------+
                    |
                    v
+---------------------------------------+
| Ledger + Billing + Settlement         |
| wallets, revenue share, payout        |
+---------------------------------------+
```

---

## MVP 模块

```txt
apps/
  api/                 控制面 API：apps、users、keys、wallets、usage。
  gateway/             OpenAI-compatible request proxy 和路由选择。
  dashboard/           开发者控制台和管理后台。

packages/
  sdk-js/              浏览器/服务端 TypeScript SDK。
  react/               可直接嵌入的 React 组件。
  shared/              共享类型、schema 和工具函数。

services/
  local-bridge/        面向 Ollama、vLLM、LM Studio 的本地/局域网模型桥。
  rating-worker/       token 用量定价和毛利计算。
  settlement-worker/   wallet entries、payouts、reconciliation。

infra/
  db/                  PostgreSQL schema 和 migrations。
  docker/              本地开发 compose 文件。

docs/
  WHITEPAPER.md        产品愿景、商业模式和系统架构。
  CONSTRUCTION.md      Codex-ready implementation guide。
  API_SPEC.md          公共和内部 API 规范。
  SECURITY.md          安全架构和威胁模型。
```

---

## 快速开始

本地栈通过 Docker Compose 启动 PostgreSQL、Redis 和 LiteLLM。

```bash
# 1. 启动依赖
cp .env.example .env
docker compose up -d postgres redis litellm

# 2. 安装依赖
pnpm install

# 3. 运行迁移和 seed 数据
pnpm db:migrate
pnpm db:seed

# 4. 启动 API、gateway 和 dashboard
pnpm dev

# 5. 在另一个 shell 里启动 CRM demo
pnpm --filter crm-demo dev
```

如果要使用平台云端路由，请在使用 LiteLLM 之前把真实的测试 provider key 放入 `.env`，例如 `OPENAI_API_KEY=<your-test-key>`。不要提交 `.env`。没有 provider key 时，可以用 BYOK 或 Local Bridge 完成端到端模型调用。

在 demo app 中：

```ts
import { createFaucet } from "@modelfaucet/sdk";

const faucet = createFaucet({
  publicAppId: "app_pub_demo",
  user: { id: "demo-user-1" }
});

const result = await faucet.chat({
  feature: "customer_reply",
  input: {
    ticket_text: "客户说物流太慢，要求退款。"
  }
});
```

预期行为：

```txt
- SDK 创建短期 session token。
- Gateway 路由到平台 provider pool。
- 响应流式返回应用。
- usage_events 写入一行记录。
- ledger_entries 记录用户扣款、provider cost、developer revenue、platform revenue。
- Developer dashboard 展示用量和收入。
```

---

## 文档站

仓库包含用于 GitHub Pages 的 VitePress 文档站配置。

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

Pages workflow 会在推送到 `main` 后，从 `docs/.vitepress/dist` 发布文档站。

---

## API 兼容性

ModelFaucet 尽量暴露 OpenAI-compatible endpoints：

```txt
POST /v1/chat/completions
POST /v1/responses
POST /v1/embeddings
```

同时暴露 ModelFaucet 专用 endpoints：

```txt
POST   /v1/sessions
GET    /v1/user/wallet
POST   /v1/admin/wallets/:id/credit-test-balance
POST   /v1/user/provider-keys
GET    /v1/user/provider-keys
DELETE /v1/user/provider-keys/:id
POST   /v1/developer/provider-keys
GET    /v1/developer/provider-keys
DELETE /v1/developer/provider-keys/:id
POST   /v1/user/stripe/checkout-sessions
POST   /v1/stripe/webhook
POST   /v1/admin/payouts/run-mock
POST   /v1/admin/payouts/:id/mark-paid
GET    /v1/apps/:id/usage
```

---

## 安全模型

不要把真实 provider API key 放进客户端代码。

SDK 可以包含：

```txt
- public_app_id
- public gateway URL
- feature manifest
- ephemeral session token
```

SDK 绝不能包含：

```txt
- OpenAI API key
- Anthropic API key
- Gemini API key
- OpenRouter API key
- Cloud provider secret
- developer 或 end user 的 raw secret after storage
```

真实密钥应该放在服务端 vault 或 KMS 中。浏览器和移动端客户端只接收短期 virtual sessions。

Local/LAN endpoints 必须通过 Local Bridge 调用。云端 gateway 不能直接访问用户的私有网络地址。

---

## 收入模型

平台 faucet mode：

```txt
retail_price = upstream_cost × (1 + markup_percent)
gross_margin = retail_price - upstream_cost
developer_revenue = gross_margin × channel_share
platform_revenue = gross_margin - developer_revenue
```

BYOK mode：

```txt
upstream_cost_to_modelfaucet = 0
revenue = explicit gateway fee / subscription fee only
```

Local mode：

```txt
upstream_cost_to_modelfaucet = 0
revenue = local bridge / enterprise management / support fee
```

---

## Feature manifest 示例

```yaml
app:
  name: Acme CRM AI
  vertical: crm

features:
  - key: customer_reply
    display_name: 客户回复生成
    input_schema:
      ticket_text: string
      customer_profile: object
    output_schema:
      reply: string
      risk_flags: array
    default_model_policy: cheapest_sufficient
    privacy_policy: redact_pii_before_cloud
    route_preference:
      - local
      - end_user_byok
      - developer_key
      - platform_pool
    pricing:
      mode: usage_markup
      markup_percent: 30
    revenue_share:
      channel_bps: 4000
      platform_bps: 6000
```

---

## 开发路线图

```txt
Phase 0 - Spec package
  README、whitepaper、construction docs、API spec、DB schema。

Phase 1 - Minimum revenue loop
  SDK -> session -> gateway -> LiteLLM -> usage -> ledger -> dashboard。

Phase 2 - BYOK
  终端用户 provider key storage、verification、routing 和 usage reporting。

Phase 3 - Local Bridge
  Ollama/vLLM/LM Studio support、local health checks、usage reporting。

Phase 4 - Developer provider keys
  Developer key vault、routing priority、budgets、fallback。

Phase 5 - Payments and payouts
  Credits、wallet、Stripe test mode、payout workflow。

Phase 6 - Public open-source launch
  Docker Compose、docs site、example plugins、contribution guide。
```

---

## 文档

从这里开始：

```txt
docs/WHITEPAPER.md
  产品愿景、商业模式和系统架构。

docs/index.md
  文档站首页。

docs/quickstart.md
  文档站 quickstart。

docs/CONSTRUCTION.md
  构建计划、仓库结构、milestones、tasks、acceptance criteria。

docs/API_SPEC.md
  SDK、gateway、BYOK、local bridge、ledger 的 API contracts。

docs/SECURITY.md
  Threat model、secret handling、local network protection。

docs/CODEX_TASKS.md
  Codex implementation task list 和 prompts。

docs/RELEASE_CHECKLIST.md
  Prerelease 和 hosted production verification checklist。
```

---

## 许可证

Apache-2.0。详见 `LICENSE`。

---

## 项目名称说明

发布 package 或托管服务之前仍需确认：

```txt
- GitHub organization / repository
- npm package availability
- PyPI package availability
- Docker Hub / GHCR namespace
- Domain availability
- 目标市场商标冲突
```

---

## 仓库 bootstrap checklist

```txt
[x] Create GitHub repo: HiClawBot/modelfaucet
[x] Add LICENSE
[x] Add CODE_OF_CONDUCT.md
[x] Add CONTRIBUTING.md
[x] Add SECURITY.md
[x] Add docs site config
[x] Add pnpm workspace
[x] Add apps/api
[x] Add apps/gateway
[x] Add apps/dashboard
[x] Add packages/sdk-js
[x] Add packages/react
[x] Add infra/db migrations
[x] Add docker-compose.yml
[x] Add first CRM demo
```

---

## 维护者原则

ModelFaucet 必须遵守三条硬规则：

```txt
1. 不把真实 provider keys 放进客户端。
2. BYOK mode 不做隐藏收费。
3. 云端服务不访问用户私有网络。
```
