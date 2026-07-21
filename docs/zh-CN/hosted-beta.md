# Hosted Beta

ModelFaucet `v1.3.0-beta.1` 已发布源码和容器 prerelease，并定义了面向少量邀请制 pilot 的托管 Beta 部署契约。不可变镜像与 provenance 已可用；在承载真实流量前，运营者仍需准备托管 PostgreSQL、托管 Redis、secret manager、ingress/TLS、监控、备份策略和目标环境专用 runbook。

## 安全边界

Hosted beta 必须保持这些规则：

- Provider API key 只能在服务端。不要把 provider key 放入 Vite、Dashboard、CRM demo、SDK、React、浏览器扩展或移动端环境变量。
- BYOK 必须对终端用户可见且明确。不要添加隐藏 BYOK markup、隐藏价差或隐藏费用。
- 云端服务不能获取用户或 provider 提供的 localhost、metadata endpoint、link-local 地址或私有 LAN URL。

## 环境契约

使用 `.env.hosted.example` 作为清单模板，然后把真实值放入 KMS、Vault、云 secret manager 或私有部署环境。不要提交已填充的 env 文件。

必需的公开配置：

```txt
NODE_ENV=production
HOSTED_ENVIRONMENT
HOSTED_SECRET_MANAGER
MODELFAUCET_API_IMAGE
MODELFAUCET_GATEWAY_IMAGE
MODELFAUCET_DASHBOARD_IMAGE
API_PUBLIC_BASE_URL
DASHBOARD_PUBLIC_APP_ID
GATEWAY_PUBLIC_BASE_URL
DASHBOARD_PUBLIC_BASE_URL
PUBLIC_SUPPORT_URL
API_CORS_ORIGINS
GATEWAY_CORS_ORIGINS
SECURITY_CONTACT_EMAIL
ABUSE_CONTACT_EMAIL
INCIDENT_CONTACT_EMAIL
```

必需的服务端 secret：

```txt
DATABASE_URL
REDIS_URL
SECRET_ENCRYPTION_KEY
ADMIN_TOKEN
DEVELOPER_ADMIN_TOKEN
LITELLM_BASE_URL
LITELLM_MASTER_KEY
METRICS_TOKEN
```

必需的服务端计费策略（配置，不是 secret）：

```txt
GATEWAY_PLATFORM_MODEL
GATEWAY_PLATFORM_INPUT_PRICE_PER_1M_TOKENS_USD
GATEWAY_PLATFORM_OUTPUT_PRICE_PER_1M_TOKENS_USD
GATEWAY_PLATFORM_MARKUP_PERCENT
GATEWAY_PLATFORM_MAX_INPUT_TOKENS
GATEWAY_PLATFORM_MAX_OUTPUT_TOKENS
GATEWAY_RESERVATION_TTL_MS
TRUST_PROXY_HOPS
API_SESSION_RATE_LIMIT_MAX_REQUESTS
API_SESSION_RATE_LIMIT_WINDOW_MS
API_PLATFORM_ONLY=1
GATEWAY_PLATFORM_ONLY=1
API_REQUIRE_SESSION_ORIGIN=1
API_ENABLE_STRIPE_PAYMENTS=0
API_ENABLE_PAYOUTS=0
API_ENABLE_PROVIDER_KEYS=0
API_ENABLE_TEST_CREDITS=0
```

可选服务端 secret，在启用对应 pilot 流量前必须存在：

```txt
OPENAI_API_KEY
OPENROUTER_API_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

部署前先运行环境校验：

```bash
pnpm hosted:verify-env
```

三个镜像变量必须填写带 tag 的 `container-images` workflow 产出的精确
`ghcr.io/...@sha256:<64 hex>` 引用。Release tag 只用于定位版本，托管 Compose
不部署可变 tag。

真实 provider pilot 流量前设置 `REQUIRE_HOSTED_PROVIDER=1`；启用托管 Stripe 充值前设置 `REQUIRE_HOSTED_STRIPE=1`。

## 平台路由计费契约

首个 Beta 必须把 `GATEWAY_PLATFORM_MODEL` 映射到唯一、已审核的 LiteLLM
模型或别名。输入/输出 token 单价必须是正数，并来自 provider 当前有效价目表；
同时在部署变更记录中保存来源和生效日期。不得将该策略指向候选 provider 或价格
不一致的动态别名。

Gateway 会拒绝客户端指定的平台模型，强制执行服务端输入/输出上限，并在调用
LiteLLM 前从可支配钱包余额中预占最坏情况下的零售价。结算只使用 provider
返回的 token 用量和服务端价格。超时预占或结果不确定的结算会进入
`requires_review`；在运营者根据 provider request log 完成对账前，不得静默释放
或重试。

## 参考 Compose

托管参考 Compose 文件位于 `infra/hosted/docker-compose.hosted.yml`。它默认使用外部托管 PostgreSQL URL，并且只从环境变量注入敏感值。

```bash
docker compose -f infra/hosted/docker-compose.hosted.yml config
docker compose -f infra/hosted/docker-compose.hosted.yml up -d
```

Dashboard 在容器运行期只接收 `MODELFAUCET_API_BASE_URL` 和
`MODELFAUCET_PUBLIC_APP_ID`。运营者或 pilot 在 UI 中手动输入有 scope、会过期的
developer token；token 只保存在 `sessionStorage`，断开时删除。不得把 developer
或 operator token 注入 image、运行期配置脚本、URL 或浏览器可见环境变量。

## 数据库和隔离检查

只对目标 hosted Beta 数据库审核并运行有序迁移。`infra/db/seed.sql` 只用于开发/CI，禁止在 staging 或 production 运行：

```bash
pnpm db:migration:plan
pnpm db:migrate
pnpm db:verify-migrations
pnpm hosted:check-isolation
```

新建 pilot 时使用 `pnpm db:bootstrap:production` 创建 developer、app、系统钱包和零余额 developer wallet；所需变量见[运维指南](./operations.md)。该命令可重入，不创建 end user、credits 或 ledger entry。

`pnpm hosted:check-isolation` 会验证 usage event、session、provider credential 和 wallet 是否仍绑定到预期 app、developer 或 end-user owner。这个检查只读，并且不会打印 secret。

## Readiness Smoke

配置 ingress 和 TLS 后，验证公开 readiness endpoint：

```bash
MODELFAUCET_API_BASE_URL=https://api.example.com \
MODELFAUCET_GATEWAY_BASE_URL=https://gateway.example.com/v1 \
MODELFAUCET_METRICS_TOKEN="$METRICS_TOKEN" \
pnpm hosted:smoke-readiness
```

Smoke 要求 API/Gateway 依赖检查、鉴权后的 metrics 和 provider health 全部正常。
脚本默认拒绝 localhost 和私有网络目标；只有在受控私有 staging 检查中才应
显式设置 `ALLOW_PRIVATE_HOSTED_SMOKE=1`。

## 产生费用的 Canary 与 Soak

Readiness 不会生成 completion。运营者为 staging canary wallet 充值并批准
provider 成本后，运行一次低 token golden path：

```bash
ALLOW_PROVIDER_BILLING=1 \
MODELFAUCET_API_BASE_URL=https://api.example.com \
MODELFAUCET_GATEWAY_BASE_URL=https://gateway.example.com/v1 \
MODELFAUCET_PUBLIC_APP_ID=app_staging_canary \
MODELFAUCET_CANARY_ORIGIN=https://pilot.example.com \
MODELFAUCET_CANARY_MODEL=reviewed-provider-model \
MODELFAUCET_CANARY_MAX_TOKENS=8 \
pnpm hosted:smoke-canary
```

Canary 会创建 session、发送一个产生费用的 completion，然后用同一个
idempotency key 重放完全相同的请求，并要求 request ID 和内容保持一致。脚本
不会打印 session 或 provider secret。晋级前，必须用输出的 request ID 对照
usage ledger 与 provider 账单。

发布 soak 使用同一路径。正式验收默认运行 60 分钟、一个 worker、最多 360 个
产生费用的调用，失败率上限 1%，p95 上限 10 秒。短时运行必须显式设置
`ALLOW_SHORT_SOAK=1`，只能证明脚本可运行，不能作为发布证据：

```bash
ALLOW_PROVIDER_BILLING=1 \
SOAK_DURATION_SECONDS=3600 \
SOAK_MAX_RUNS=360 \
SOAK_REPORT_FILE=/secure/evidence/modelfaucet-soak.json \
pnpm hosted:soak
```

沿用上方 `MODELFAUCET_*` canary 变量。报告文件不能预先存在，避免覆盖历史证据。

## Pilot 入驻闸门

启用 pilot app 前：

- 设置明确的 app status、CORS origin、rate limit、feature manifest、服务端模型/单价、markup、token 上限和 revenue share。
- 首个 hosted Beta 必须关闭 BYOK、developer-key routing、Local Bridge、payment、payout、test-credit、streaming、Responses 和 Embeddings。
- 给每个 pilot 设置精确 HTTPS origin、app 月度限额和单 session 限额。
- 只使用服务端 provider key 验证唯一的平台路由。
- 在后续版本通过 Stripe test-mode 和 webhook staging 门禁前，不得暴露购入额度流程。
- 在部署记录中写明 support、abuse、security 和 incident 联系方式。

## Acceptable Use Policy

Hosted beta pilot 不得将 ModelFaucet 用于凭证盗取、恶意软件、垃圾信息、绕过访问控制、骚扰、非法监控、未经必要审查的受监管建议，或尝试让 ModelFaucet 云端服务访问 localhost、metadata service、link-local host 或私有 LAN 资源。

当检测到 abuse、失控成本、支付风险或安全风险时，运营者可以限流、暂停或禁用 app、session、key 或 wallet。

## 事故响应

Hosted beta 至少需要这些联系方式：

```txt
support:  PUBLIC_SUPPORT_URL
security: SECURITY_CONTACT_EMAIL
abuse:    ABUSE_CONTACT_EMAIL
incident: INCIDENT_CONTACT_EMAIL
```

最低响应 playbook：

- 按 request ID、app、developer、route mode、provider 和 wallet 定位。
- 禁用受影响 app、feature、provider credential、session 或 payout workflow。
- 怀疑泄露时轮换 provider key、LiteLLM master key、admin token 和 encryption key。
- 保留 audit log、usage event、ledger entry 和 provider attempt metadata。
- 如果数据完整性受影响，从最近一次已验证备份恢复。
- 确认存在用户影响或计费影响时，发布面向 pilot 的 incident note。
