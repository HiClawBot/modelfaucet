# Hosted Beta

ModelFaucet `0.9.0` 增加了面向少量 pilot 的托管 beta 部署契约。这仍然是源码 beta 参考：在承载生产流量前，运营者仍需准备托管 PostgreSQL、secret manager、ingress/TLS、监控、备份策略和目标环境专用 runbook。

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
API_PUBLIC_BASE_URL
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
SECRET_ENCRYPTION_KEY
ADMIN_TOKEN
DEVELOPER_ADMIN_TOKEN
LITELLM_BASE_URL
LITELLM_MASTER_KEY
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

真实 provider pilot 流量前设置 `REQUIRE_HOSTED_PROVIDER=1`；启用托管 Stripe 充值前设置 `REQUIRE_HOSTED_STRIPE=1`。

## 参考 Compose

托管参考 Compose 文件位于 `infra/hosted/docker-compose.hosted.yml`。它默认使用外部托管 PostgreSQL URL，并且只从环境变量注入敏感值。

```bash
docker compose -f infra/hosted/docker-compose.hosted.yml config
docker compose -f infra/hosted/docker-compose.hosted.yml up -d
```

Dashboard 构建只接收 `VITE_MODELFAUCET_API_BASE_URL`。不要用 `VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN` 构建公开 Dashboard bundle。

## 数据库和隔离检查

只对目标 hosted beta 数据库运行迁移和 seed：

```bash
pnpm db:migrate
pnpm db:seed
pnpm hosted:check-isolation
```

`pnpm hosted:check-isolation` 会验证 usage event、session、provider credential 和 wallet 是否仍绑定到预期 app、developer 或 end-user owner。这个检查只读，并且不会打印 secret。

## Readiness Smoke

配置 ingress 和 TLS 后，验证公开 readiness endpoint：

```bash
MODELFAUCET_API_BASE_URL=https://api.example.com \
MODELFAUCET_GATEWAY_BASE_URL=https://gateway.example.com/v1 \
pnpm hosted:smoke-readiness
```

Smoke 脚本默认拒绝 localhost 和私有网络目标；只有在受控私有 staging 检查中才应显式设置 `ALLOW_PRIVATE_HOSTED_SMOKE=1`。

## Pilot 入驻闸门

启用 pilot app 前：

- 设置明确的 app status、CORS origin、rate limit、feature manifest、markup 和 revenue share。
- 确认可用的 BYOK/local/platform mode 都有用户可见的控制。
- 给 developer 和 end-user wallet 设置适合 pilot 的限额。
- 只用服务端 provider key 验证 provider routing。
- 暴露充值流程前，先验证 Stripe test-mode top-up 和 webhook delivery。
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
