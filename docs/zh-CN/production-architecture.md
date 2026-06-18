# 生产参考架构

本文描述 ModelFaucet `1.0.0` source GA 的推荐部署形态。这不是托管服务上线声明；运营者仍需自行配置云资源、DNS、TLS、备份、日志和告警。

## Components

```txt
Browser / Third-party App
  -> HTTPS Ingress / WAF / Rate Limit
  -> ModelFaucet API
  -> ModelFaucet Gateway
  -> LiteLLM
  -> Cloud Provider APIs

API / Gateway / Workers
  -> PostgreSQL
  -> Redis
  -> Secret Manager
  -> Logs / Metrics / Alerts
```

## Secret Manager

这些值应放入 KMS、Vault 或云 secret manager：

- `DATABASE_URL`
- `SECRET_ENCRYPTION_KEY`
- `ADMIN_TOKEN`
- `DEVELOPER_ADMIN_TOKEN`
- `LITELLM_MASTER_KEY`
- Provider API keys
- Stripe secrets

不要把 provider keys、Stripe secrets 或 admin tokens 放入 Vite client env vars。

## 网络边界

Public ingress 应终止 TLS，并只转发预期的 API、Gateway 和 Dashboard routes。PostgreSQL、Redis 和 LiteLLM 应保持在部署私有网络内，除非目标环境要求使用带严格 allowlist 的托管公开 endpoint。

Private-Network Guard 必须继续对 cloud-side provider 和 smoke targets 生效。云服务不能调用用户提供的 localhost、metadata endpoint、link-local address 或 private LAN URL。

## Observability

最低生产信号：

- API 和 Gateway request IDs。
- API 和 Gateway `/ready`。
- `/metrics` scrape，包含 request totals、duration sums 和 rate-limit counters。
- `/health/providers` provider health。
- Wallet reconciliation 和 tenant isolation checks。
- Admin 和 developer-console actions 的 audit-log review。

## Backup And Restore

升级前和固定周期内都应备份 PostgreSQL。Hosted pilot 或 GA rollout 前，应在非生产数据库测试 restore。

最低 restore validation：

- Migrations cleanly apply。
- `pnpm hosted:check-isolation` 通过。
- Wallet reconciliation 没有非预期 mismatch。
- Local 或 staging smoke test 能创建 session 和 ledger entries。

## Incident Response

Incident Response 必须能禁用 apps、sessions、provider credentials、top-ups 和 payout workflows。执行破坏性恢复前，运营者应保留 request IDs、audit logs、usage events、ledger entries 和 provider attempt metadata。
