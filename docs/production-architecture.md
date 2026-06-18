# Production Reference Architecture

This reference architecture describes the recommended deployment shape for ModelFaucet `1.0.0` source GA. It is not a managed hosted service claim; operators must still configure their own cloud resources, DNS, TLS, backups, logs, and alerting.

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

Store these values in KMS, Vault, or a cloud secret manager:

- `DATABASE_URL`
- `SECRET_ENCRYPTION_KEY`
- `ADMIN_TOKEN`
- `DEVELOPER_ADMIN_TOKEN`
- `LITELLM_MASTER_KEY`
- Provider API keys
- Stripe secrets

Do not put provider keys, Stripe secrets, or admin tokens in Vite client env vars.

## Network Boundaries

The public ingress should terminate TLS and forward only expected API, Gateway, and Dashboard routes. PostgreSQL, Redis, and LiteLLM should be private to the deployment network unless the deployment target requires a managed public endpoint with strict allowlists.

The Private-Network Guard must stay enabled for cloud-side provider and smoke targets. Cloud services must not call localhost, metadata endpoints, link-local addresses, or private LAN URLs supplied by users.

## Observability

Minimum production signals:

- API and Gateway request IDs.
- `/ready` checks for API and Gateway.
- `/metrics` scrape for request totals, duration sums, and rate-limit counters.
- Provider health from `/health/providers`.
- Wallet reconciliation and tenant isolation checks.
- Audit-log review for admin and developer-console actions.

## Backup And Restore

Back up PostgreSQL before upgrades and on a scheduled cadence. Restore should be tested on a non-production database before a hosted pilot or GA rollout.

Minimum restore validation:

- Migrations apply cleanly.
- `pnpm hosted:check-isolation` passes.
- Wallet reconciliation has zero unexpected mismatches.
- A local or staging smoke test can create a session and ledger entries.

## Incident Response

Incident Response must be able to disable apps, sessions, provider credentials, top-ups, and payout workflows. Operators should preserve request IDs, audit logs, usage events, ledger entries, and provider attempt metadata before destructive recovery.
