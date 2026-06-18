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
pnpm hosted:smoke-readiness
```

Set `REQUIRE_HOSTED_PROVIDER=1` before real provider traffic and `REQUIRE_HOSTED_STRIPE=1` before hosted Stripe top-ups.

## Required Operator Review

- Confirm `API_CORS_ORIGINS` and `GATEWAY_CORS_ORIGINS` are explicit origins.
- Confirm provider keys exist only in server-side env or secret manager configuration.
- Confirm Dashboard bundles are not built with developer admin tokens.
- Confirm database backup and restore have been tested for the deployment target.
- Confirm incident contacts are current.

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
