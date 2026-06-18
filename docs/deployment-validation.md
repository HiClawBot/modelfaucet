# Deployment Validation

Use this guide before promoting a self-hosted ModelFaucet environment.

## Docker/Compose Validation

Validate both the local and hosted Compose files:

```bash
pnpm compose:verify
```

This command runs:

```bash
docker compose config
docker compose -f infra/hosted/docker-compose.hosted.yml config
```

On a local workstation without Docker, use this only to continue non-Docker development:

```bash
COMPOSE_VERIFY_ALLOW_MISSING_DOCKER=1 pnpm compose:verify
```

Do not treat that skip as release evidence. Release validation and hosted promotion must run on a Docker-capable machine or in CI.

## Secret Manager

Populate `.env.hosted.example` from a real secret manager or private deployment environment. Do not commit populated env files.

Required secret-manager values:

- `DATABASE_URL`
- `SECRET_ENCRYPTION_KEY`
- `ADMIN_TOKEN`
- `DEVELOPER_ADMIN_TOKEN`
- `LITELLM_MASTER_KEY`
- Provider API keys when provider traffic is enabled.
- Stripe secrets when hosted Stripe top-ups are enabled.

Run:

```bash
pnpm hosted:verify-env
```

Before real provider traffic:

```bash
REQUIRE_HOSTED_PROVIDER=1 pnpm hosted:verify-env
```

Before hosted Stripe top-ups:

```bash
REQUIRE_HOSTED_STRIPE=1 pnpm hosted:verify-env
```

## CORS

Production deployments must set explicit origins:

```txt
API_CORS_ORIGINS=https://dashboard.example.com,https://app.example.com
GATEWAY_CORS_ORIGINS=https://app.example.com
```

Do not use `*` in production. Do not include localhost origins in hosted production CORS unless the environment is an explicitly isolated staging target.

## Public Readiness

After DNS, TLS, ingress, API, Gateway, and LiteLLM are configured:

```bash
MODELFAUCET_API_BASE_URL=https://api.example.com \
MODELFAUCET_GATEWAY_BASE_URL=https://gateway.example.com/v1 \
pnpm hosted:smoke-readiness
```

The hosted readiness smoke refuses localhost/private-network targets by default. Use `ALLOW_PRIVATE_HOSTED_SMOKE=1` only for controlled private staging checks.

## Database Validation

After migration:

```bash
pnpm hosted:check-isolation
```

Then review wallet reconciliation and audit logs before admitting pilot traffic.
