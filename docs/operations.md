# Operations and Observability

ModelFaucet includes lightweight operations hooks for local, hosted, and deployment-release workflows.

## Request IDs

The API and Gateway return `x-request-id` on every response. If a caller sends
`x-request-id`, ModelFaucet preserves it; otherwise the service generates one.

Error responses include the same ID:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid session request.",
    "request_id": "req_example"
  }
}
```

Use this ID when tracing SDK calls, Gateway requests, provider failures, wallet
errors, and ledger writes.

## Readiness

```txt
GET /ready
```

The API actively checks PostgreSQL plus both Redis-backed rate limiters. The
Gateway actively checks PostgreSQL, Redis, and the configured platform provider.
A failed or two-second timed-out dependency returns HTTP `503` with only
`ok`/`unavailable` states; connection strings and provider errors are never
returned. `GET /health` remains the shallow liveness endpoint.

## Metrics

```txt
GET /metrics
```

Hosted requests must send `Authorization: Bearer <METRICS_TOKEN>`. Keep this
endpoint on an internal monitoring path even though it is token-protected.

The API and Gateway expose Prometheus-style text metrics:

```txt
modelfaucet_http_requests_total{service="@modelfaucet/gateway",method="POST",route="/v1/chat/completions",status="200"} 1
modelfaucet_http_request_duration_ms_sum{service="@modelfaucet/gateway",method="POST",route="/v1/chat/completions",status="200"} 25.000
modelfaucet_rate_limited_total{service="@modelfaucet/gateway",route="/v1/chat/completions"} 1
```

These in-process metrics reset on restart. Production deployments should scrape
them into Prometheus, OpenTelemetry Collector, or the platform's metrics backend.

## Rate Limits

The API and Gateway use fixed, low-cardinality route patterns. The Gateway
applies both client-IP and hashed-session buckets; session creation has a
separate app+IP bucket. Redis increments and expiry repair run in one Lua
operation. Defaults are wide enough for local smoke tests:

```bash
REDIS_URL=redis://redis:3290
API_RATE_LIMIT_MAX_REQUESTS=1200
API_RATE_LIMIT_WINDOW_MS=60000
GATEWAY_RATE_LIMIT_MAX_REQUESTS=1200
GATEWAY_RATE_LIMIT_WINDOW_MS=60000
TRUST_PROXY_HOPS=1
```

Set `*_MAX_REQUESTS=0` to disable the limiter in a trusted local environment.
Production requires `REDIS_URL`; local development may fall back to the
in-memory limiter. Set `TRUST_PROXY_HOPS` to the exact number of trusted ingress
proxies so forwarded client IPs cannot be spoofed.

## Migration Rollback

Production migrations are ordered by `infra/db/migrations/manifest.json` and
serialized with a PostgreSQL advisory lock. Each applied migration stores the
SHA-256 of its SQL; editing a previously applied migration causes both migrate
and verify to fail. Review the plan and verify the database after applying it:

```bash
pnpm db:migration:plan
pnpm db:migrate
pnpm db:verify-migrations
```

`infra/db/seed.sql` is development/CI demo data. Never run `pnpm db:seed`
against staging or production. For a new pilot, run the zero-credit idempotent
bootstrap with explicit operator-provided values:

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

The origin list contains exact HTTPS origins, not paths or wildcards. The
monthly and per-session limits are enforced under PostgreSQL advisory locks
before provider execution; keep wallet credits at or below the approved pilot
exposure as a second hard ceiling.

Rollback procedure for a failed migration attempt:

1. Stop API, Gateway, workers, Dashboard, and demo traffic.
2. Take a fresh database backup before changing anything.
3. Restore the last known-good backup into a staging database.
4. Run `pnpm db:migration:plan`, `pnpm db:migrate`, and `pnpm db:verify-migrations` against staging.
5. Run hosted isolation and readiness checks against staging; do not seed a restored production dataset.
6. Promote the restored database or apply a forward-only fix.

Avoid destructive ad hoc SQL on production. Prefer forward-only corrective
migrations with a tested restore path.

## Backup and Restore

Create a non-overwriting custom-format backup:

```bash
BACKUP_FILE=/secure/backups/modelfaucet-$(date +%Y%m%d-%H%M%S).dump \
BACKUP_METRICS_FILE=/var/lib/node_exporter/textfile/modelfaucet-backup.prom \
pnpm db:backup
```

Verify that backup in a new, dedicated database. The target name must contain
`restore` or `verify`; the script refuses to overwrite an existing database and
removes a successful local drill database unless `KEEP_RESTORE_DATABASE=1`:

```bash
BACKUP_FILE=/secure/backups/modelfaucet-20260721-120000.dump \
RESTORE_DATABASE_URL=postgresql://localhost:3200/modelfaucet_restore_verify \
ALLOW_DATABASE_RESTORE=1 \
pnpm db:restore:verify
```

Production deployments should use managed automated backups, point-in-time
recovery, encrypted snapshots, restore drills, and retention settings that match
the deployment's compliance requirements. A successful dump is not evidence of
recoverability; schedule and record restore verification.

## Alerts and release rollback

`infra/monitoring/prometheus-alerts.yml` provides the first-Beta minimum for
service down, readiness failure, 5xx ratio, rate-limit surge, and stale backup.
Every alert must be routed and test-fired in staging before pilot traffic.
Run the read-only financial/reservation invariants on a schedule and export them
to the node-exporter textfile directory when available:

```bash
OPERATIONS_METRICS_FILE=/var/lib/node_exporter/textfile/modelfaucet-operations.prom \
pnpm hosted:check-operations
```

Application rollback uses the previous three immutable image digests only after
confirming the already-applied schema is backward-compatible:

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

Do not roll schema backward in place. If data integrity is affected, stop
traffic and follow the tested restore/forward-fix procedure above.
