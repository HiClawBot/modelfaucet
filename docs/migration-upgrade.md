# Migration And Upgrade Guide

This guide covers source upgrades for ModelFaucet `1.x`.

## Upgrade From `0.9.0` To `1.0.0`

`1.0.0` is primarily a GA contract release. It does not require a schema change beyond the existing `infra/db/schema.sql`, but operators should still run the normal migration and verification path against a staging database before production rollout.

```bash
pnpm install --frozen-lockfile
pnpm verify:secrets
pnpm ga:verify
pnpm db:migrate
pnpm hosted:check-isolation
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:build
```

For a hosted environment, also run:

```bash
pnpm hosted:verify-env
MODELFAUCET_METRICS_TOKEN="$METRICS_TOKEN" pnpm hosted:smoke-readiness
```

Set `REQUIRE_HOSTED_PROVIDER=1` before real provider traffic and `REQUIRE_HOSTED_STRIPE=1` before hosted Stripe top-ups.

## Required Operator Review

- Confirm `API_CORS_ORIGINS` and `GATEWAY_CORS_ORIGINS` are explicit origins.
- Confirm provider keys exist only in server-side env or secret manager configuration.
- Confirm Dashboard bundles are not built with developer tokens or developer admin tokens.
- Confirm database backup and restore have been tested for the deployment target.
- Confirm incident contacts are current.

## Upgrade To `1.3.0-beta.1`

`1.3.0-beta.1` adds deployment-release checks, Redis-backed distributed rate limits, container publishing automation, and ordered `schema_migrations` metadata.

Before promotion:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:verify-migrations
pnpm hosted:verify-env
pnpm compose:verify
pnpm container:verify
pnpm smoke:local
```

For hosted API and Gateway instances, set `REDIS_URL` to a server-side Redis or Redis-compatible endpoint. Do not expose `REDIS_URL`, provider API keys, developer tokens, or developer admin tokens through browser-visible Vite environment variables.

Container images are built by `.github/workflows/container-images.yml` for
`v*.*.*` tags and are published to GHCR only on tag builds. The workflow emits
one `name@sha256` artifact per service, records build provenance, pulls the
published digest back from GHCR, and runs the production image smoke against
that digest. Copy those three references into the hosted environment; do not
deploy the tag itself.

## Rollback

If a `1.0.0` rollout fails before database writes occur, roll back the application containers to the previous image or commit.

If database writes occurred:

- Stop API and Gateway traffic.
- Preserve logs, request IDs, audit logs, usage events, ledger entries, and provider attempt metadata.
- Compare wallet reconciliation before and after rollback.
- Restore from the most recent tested backup only when data integrity is affected.
- Rotate provider keys, admin tokens, LiteLLM master key, or encryption keys when exposure is suspected.

## Fresh Install

For a fresh source install, use the quickstart and then run:

```bash
pnpm smoke:local
pnpm hosted:check-isolation
```

The local smoke path uses a mock provider and does not require real provider keys.
