# 运维和可观测性

ModelFaucet 包含面向本地、托管和部署发布流程的轻量级运维能力。

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

API 会主动检查 PostgreSQL 和两个 Redis 限流器；Gateway 会主动检查
PostgreSQL、Redis 和已配置的平台 provider。依赖失败或检查超过 2 秒时返回
HTTP `503`，响应中只包含 `ok`/`unavailable` 状态，不泄露连接串或 provider
错误。`GET /health` 继续作为浅层 liveness endpoint。

## Metrics

```txt
GET /metrics
```

Hosted 请求必须携带 `Authorization: Bearer <METRICS_TOKEN>`。即使已有 token
保护，也应只通过内部监控路径暴露该端点。

API 和 Gateway 暴露 Prometheus-style 文本指标：

```txt
modelfaucet_http_requests_total{service="@modelfaucet/gateway",method="POST",route="/v1/chat/completions",status="200"} 1
modelfaucet_http_request_duration_ms_sum{service="@modelfaucet/gateway",method="POST",route="/v1/chat/completions",status="200"} 25.000
modelfaucet_rate_limited_total{service="@modelfaucet/gateway",route="/v1/chat/completions"} 1
```

这些进程内指标会在服务重启后清零。生产部署应将其采集到 Prometheus、OpenTelemetry Collector 或云平台 metrics backend。

## Rate Limits

API 和 Gateway 使用固定、低基数的 route pattern。Gateway 同时按 client IP
和 session token hash 分桶；session 创建另有 app+IP 分桶。Redis 计数与过期
修复通过一次 Lua 原子操作完成。默认值足够宽松，不会影响本地 smoke test：

```bash
REDIS_URL=redis://redis:3290
API_RATE_LIMIT_MAX_REQUESTS=1200
API_RATE_LIMIT_WINDOW_MS=60000
GATEWAY_RATE_LIMIT_MAX_REQUESTS=1200
GATEWAY_RATE_LIMIT_WINDOW_MS=60000
TRUST_PROXY_HOPS=1
```

在可信本地环境中，可以设置 `*_MAX_REQUESTS=0` 禁用。生产环境强制要求
`REDIS_URL`；本地开发可以回退到内存 limiter。将 `TRUST_PROXY_HOPS` 设为
真实可信 ingress 层数，避免伪造 forwarded IP。

## Migration Rollback

生产迁移由 `infra/db/migrations/manifest.json` 排序，并通过 PostgreSQL advisory lock 串行执行。每个已应用迁移都会保存 SQL 的 SHA-256；改写历史迁移会让 migrate 和 verify 直接失败。执行前查看计划，执行后校验：

```bash
pnpm db:migration:plan
pnpm db:migrate
pnpm db:verify-migrations
```

`infra/db/seed.sql` 只用于开发和 CI demo。staging/production 禁止运行 `pnpm db:seed`。创建新 pilot 时，使用显式运营参数执行零额度、可重入 bootstrap：

```bash
NODE_ENV=production \
BOOTSTRAP_DEVELOPER_NAME="Pilot Developer" \
BOOTSTRAP_DEVELOPER_EMAIL="pilot@example.com" \
BOOTSTRAP_APP_PUBLIC_ID="app_pilot" \
BOOTSTRAP_APP_NAME="Pilot App" \
BOOTSTRAP_APP_ALLOWED_ORIGINS="https://pilot.example.com" \
BOOTSTRAP_APP_MONTHLY_SPEND_LIMIT_USD="25.00000000" \
BOOTSTRAP_SESSION_SPEND_LIMIT_USD="2.00000000" \
pnpm db:bootstrap:production
```

Origin 清单必须填写精确 HTTPS origin，不能包含路径或通配符。月度和单 session
限额会在 provider 调用前通过 PostgreSQL advisory lock 并发安全地执行；wallet
试用额度仍应不高于已批准的 pilot 风险敞口，作为第二道硬上限。

迁移失败时的 rollback 流程：

1. 停止 API、Gateway、workers、Dashboard 和 demo 流量。
2. 在修改前先做一份新数据库备份。
3. 把上一份已知可用的备份恢复到 staging database。
4. 在 staging 上运行 `pnpm db:migration:plan`、`pnpm db:migrate` 和 `pnpm db:verify-migrations`。
5. 对 staging 运行 hosted isolation/readiness 检查；不要给恢复的生产数据执行 seed。
6. 提升恢复后的数据库，或应用 forward-only 修复。

生产环境不要使用破坏性的临时 SQL。优先使用已验证 restore path 的 forward-only corrective migration。

## Backup and Restore

创建不会覆盖旧文件的 custom-format 备份：

```bash
BACKUP_FILE=/secure/backups/modelfaucet-$(date +%Y%m%d-%H%M%S).dump \
BACKUP_METRICS_FILE=/var/lib/node_exporter/textfile/modelfaucet-backup.prom \
pnpm db:backup
```

在全新的专用数据库中验证备份。目标库名必须包含 `restore` 或 `verify`；脚本
拒绝覆盖已有数据库，成功后默认删除本地演练库，设置
`KEEP_RESTORE_DATABASE=1` 可保留：

```bash
BACKUP_FILE=/secure/backups/modelfaucet-20260721-120000.dump \
RESTORE_DATABASE_URL=postgresql://localhost:3200/modelfaucet_restore_verify \
ALLOW_DATABASE_RESTORE=1 \
pnpm db:restore:verify
```

生产部署应使用托管自动备份、point-in-time recovery、加密快照、恢复演练，
以及符合部署合规要求的保留策略。备份成功不等于可恢复，必须定期执行并记录
restore verification。

## 告警与版本回滚

`infra/monitoring/prometheus-alerts.yml` 提供首个 Beta 的最低告警：服务离线、
readiness 失败、5xx 比例、限流突增和备份过期。接入 pilot 流量前，每条告警
都必须在 staging 完成路由和触发演练。
定时运行只读的资金/预留不变量检查，并在可用时输出到 node-exporter textfile：

```bash
OPERATIONS_METRICS_FILE=/var/lib/node_exporter/textfile/modelfaucet-operations.prom \
pnpm hosted:check-operations
```

应用回滚只能使用上一版本三个不可变镜像 digest，并先确认已执行的 schema 向后兼容：

```bash
export MODELFAUCET_API_IMAGE="$PREVIOUS_API_IMAGE_DIGEST_REF"
export MODELFAUCET_GATEWAY_IMAGE="$PREVIOUS_GATEWAY_IMAGE_DIGEST_REF"
export MODELFAUCET_DASHBOARD_IMAGE="$PREVIOUS_DASHBOARD_IMAGE_DIGEST_REF"
docker compose -f infra/hosted/docker-compose.hosted.yml pull api gateway dashboard
docker compose -f infra/hosted/docker-compose.hosted.yml up -d --no-deps api gateway dashboard
MODELFAUCET_API_BASE_URL="$API_PUBLIC_BASE_URL" \
MODELFAUCET_GATEWAY_BASE_URL="$GATEWAY_PUBLIC_BASE_URL" \
MODELFAUCET_METRICS_TOKEN="$METRICS_TOKEN" \
pnpm hosted:smoke-readiness
```

不要原地回滚 schema。若数据完整性受损，应停流并执行上方已演练的恢复或
forward-fix 流程。
