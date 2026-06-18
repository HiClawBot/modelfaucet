# 部署验证

自托管 ModelFaucet 环境晋级前使用本指南。

## Docker/Compose Validation

同时验证 local 和 hosted Compose 文件：

```bash
pnpm compose:verify
```

该命令会运行：

```bash
docker compose config
docker compose -f infra/hosted/docker-compose.hosted.yml config
```

如果本地工作站没有 Docker，只能为了继续非 Docker 开发显式跳过：

```bash
COMPOSE_VERIFY_ALLOW_MISSING_DOCKER=1 pnpm compose:verify
```

不要把这个 skip 当作 release 证据。Release validation 和 hosted promotion 必须在 Docker-capable machine 或 CI 中执行。

## Secret Manager

用真实 secret manager 或私有部署环境填充 `.env.hosted.example`。不要提交已填充 env 文件。

必需 secret-manager values：

- `DATABASE_URL`
- `SECRET_ENCRYPTION_KEY`
- `ADMIN_TOKEN`
- `DEVELOPER_ADMIN_TOKEN`
- `LITELLM_MASTER_KEY`
- 启用 provider traffic 时的 provider API keys。
- 启用 hosted Stripe top-ups 时的 Stripe secrets。

运行：

```bash
pnpm hosted:verify-env
```

真实 provider traffic 前：

```bash
REQUIRE_HOSTED_PROVIDER=1 pnpm hosted:verify-env
```

hosted Stripe top-ups 前：

```bash
REQUIRE_HOSTED_STRIPE=1 pnpm hosted:verify-env
```

## CORS

Production deployments 必须设置显式 origins：

```txt
API_CORS_ORIGINS=https://dashboard.example.com,https://app.example.com
GATEWAY_CORS_ORIGINS=https://app.example.com
```

生产环境不要使用 `*`。除非是明确隔离的 staging target，否则 hosted production CORS 不应包含 localhost origins。

## Public Readiness

DNS、TLS、ingress、API、Gateway 和 LiteLLM 配好后：

```bash
MODELFAUCET_API_BASE_URL=https://api.example.com \
MODELFAUCET_GATEWAY_BASE_URL=https://gateway.example.com/v1 \
pnpm hosted:smoke-readiness
```

Hosted readiness smoke 默认拒绝 localhost/private-network targets。只有受控私有 staging 检查才应使用 `ALLOW_PRIVATE_HOSTED_SMOKE=1`。

## Database Validation

迁移后：

```bash
pnpm hosted:check-isolation
```

然后检查 wallet reconciliation 和 audit logs，再接入 pilot traffic。
