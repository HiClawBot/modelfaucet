# Operations and Observability

ModelFaucet `0.6.0` adds lightweight source-beta operations hooks for local and pilot deployments.

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

The API reports database configuration and Gateway base URL. The Gateway reports
repository configuration. These endpoints are intentionally shallow and safe for
container readiness probes.

## Metrics

```txt
GET /metrics
```

The API and Gateway expose Prometheus-style text metrics:

```txt
modelfaucet_http_requests_total{service="@modelfaucet/gateway",method="POST",route="/v1/chat/completions",status="200"} 1
modelfaucet_http_request_duration_ms_sum{service="@modelfaucet/gateway",method="POST",route="/v1/chat/completions",status="200"} 25.000
modelfaucet_rate_limited_total{service="@modelfaucet/gateway",route="/v1/chat/completions"} 1
```

These in-process metrics reset on restart. Production deployments should scrape
them into Prometheus, OpenTelemetry Collector, or the platform's metrics backend.

## Rate Limits

The API and Gateway include an in-memory IP+route rate limiter. Defaults are
wide enough for local smoke tests:

```bash
API_RATE_LIMIT_MAX_REQUESTS=1200
API_RATE_LIMIT_WINDOW_MS=60000
GATEWAY_RATE_LIMIT_MAX_REQUESTS=1200
GATEWAY_RATE_LIMIT_WINDOW_MS=60000
```

Set `*_MAX_REQUESTS=0` to disable the limiter in a trusted local environment.
Hosted deployments should replace this with Redis or an edge/service-mesh rate
limiter for multi-instance consistency.

## Migration Rollback

The current source tree uses idempotent SQL in `infra/db/schema.sql`.

Rollback procedure for a failed migration attempt:

1. Stop API, Gateway, workers, Dashboard, and demo traffic.
2. Take a fresh database backup before changing anything.
3. Restore the last known-good backup into a staging database.
4. Run `pnpm db:migrate` and `pnpm db:seed` against staging.
5. Run `pnpm smoke:local` against staging.
6. Promote the restored database or apply a forward-only fix.

Avoid destructive ad hoc SQL on production. Prefer forward-only corrective
migrations with a tested restore path.

## Backup and Restore

Development backup:

```bash
pg_dump "$DATABASE_URL" > modelfaucet-dev-backup.sql
```

Development restore:

```bash
dropdb modelfaucet_restore
createdb modelfaucet_restore
psql postgresql://localhost/modelfaucet_restore < modelfaucet-dev-backup.sql
DATABASE_URL=postgresql://localhost/modelfaucet_restore pnpm smoke:local
```

Production deployments should use managed automated backups, point-in-time
recovery, encrypted snapshots, restore drills, and retention settings that match
the deployment's compliance requirements.

