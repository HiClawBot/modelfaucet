# Hosted Beta monitoring assets

`prometheus-alerts.yml` is the minimum alert policy for the invite-only Beta.
Load it into the deployment's Prometheus-compatible rule engine and route
`critical` alerts to the incident contact configured for that environment.

The readiness alerts expect a blackbox probe of API and Gateway `/ready` named
`modelfaucet-api-readiness` and `modelfaucet-gateway-readiness`. Metrics scrapes
must send `Authorization: Bearer <METRICS_TOKEN>` and use the jobs
`modelfaucet-api` and `modelfaucet-gateway`.

`ModelFaucetBackupStale` expects
`modelfaucet_last_successful_backup_timestamp_seconds` from the managed backup
platform or the optional `BACKUP_METRICS_FILE` textfile written by
`pnpm db:backup`. Provider errors, reservation review states, reconciliation,
and wallet safety can be exported with `OPERATIONS_METRICS_FILE` from
`pnpm hosted:check-operations`. Database/Redis saturation and budget utilization
still need deployment-specific exporters before wider rollout.

Validate the rule syntax and all six firing thresholds with Prometheus
`v3.13.1` before promotion:

```bash
promtool check rules infra/monitoring/prometheus-alerts.yml
cd infra/monitoring && promtool test rules prometheus-alerts.test.yml
```

CI runs both commands in the exact-version official Prometheus container. These
unit tests prove rule evaluation only; staging must still load the rules into
its actual monitoring stack and test the notification route to an operator.
