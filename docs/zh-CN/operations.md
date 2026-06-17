# 运维和可观测性

ModelFaucet `0.6.0` 为本地和 pilot 部署加入轻量级 source-beta 运维能力。

## Request IDs

API 和 Gateway 会在每个响应中返回 `x-request-id`。如果调用方传入
`x-request-id`，ModelFaucet 会保留它；否则服务会生成一个新的 ID。

错误响应中也会包含同一个 ID：

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid session request.",
    "request_id": "req_example"
  }
}
```

排查 SDK 调用、Gateway 请求、provider failure、wallet error 和 ledger write 时，应使用这个 ID 串联上下文。

## Readiness

```txt
GET /ready
```

API 会报告数据库配置和 Gateway base URL。Gateway 会报告 repository 配置。该端点刻意保持浅层检查，适合作为容器 readiness probe。

## Metrics

```txt
GET /metrics
```

API 和 Gateway 暴露 Prometheus-style 文本指标：

```txt
modelfaucet_http_requests_total{service="@modelfaucet/gateway",method="POST",route="/v1/chat/completions",status="200"} 1
modelfaucet_http_request_duration_ms_sum{service="@modelfaucet/gateway",method="POST",route="/v1/chat/completions",status="200"} 25.000
modelfaucet_rate_limited_total{service="@modelfaucet/gateway",route="/v1/chat/completions"} 1
```

这些进程内指标会在服务重启后清零。生产部署应将其采集到 Prometheus、OpenTelemetry Collector 或云平台 metrics backend。

## Rate Limits

API 和 Gateway 包含基于 IP+route 的内存 rate limiter。默认值足够宽松，不会影响本地 smoke test：

```bash
API_RATE_LIMIT_MAX_REQUESTS=1200
API_RATE_LIMIT_WINDOW_MS=60000
GATEWAY_RATE_LIMIT_MAX_REQUESTS=1200
GATEWAY_RATE_LIMIT_WINDOW_MS=60000
```

在可信本地环境中，可以设置 `*_MAX_REQUESTS=0` 禁用。托管部署应替换为 Redis、edge 或 service-mesh rate limiter，以支持多实例一致性。

## Migration Rollback

当前源码树使用 `infra/db/schema.sql` 中的幂等 SQL。

迁移失败时的 rollback 流程：

1. 停止 API、Gateway、workers、Dashboard 和 demo 流量。
2. 在修改前先做一份新数据库备份。
3. 把上一份已知可用的备份恢复到 staging database。
4. 在 staging 上运行 `pnpm db:migrate` 和 `pnpm db:seed`。
5. 在 staging 上运行 `pnpm smoke:local`。
6. 提升恢复后的数据库，或应用 forward-only 修复。

生产环境不要使用破坏性的临时 SQL。优先使用已验证 restore path 的 forward-only corrective migration。

## Backup and Restore

开发环境备份：

```bash
pg_dump "$DATABASE_URL" > modelfaucet-dev-backup.sql
```

开发环境恢复：

```bash
dropdb modelfaucet_restore
createdb modelfaucet_restore
psql postgresql://localhost/modelfaucet_restore < modelfaucet-dev-backup.sql
DATABASE_URL=postgresql://localhost/modelfaucet_restore pnpm smoke:local
```

生产部署应使用托管自动备份、point-in-time recovery、加密快照、恢复演练，以及符合部署合规要求的保留策略。

