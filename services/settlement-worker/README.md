# Settlement Worker Status

`@modelfaucet/settlement-worker` is a reserved package, not a deployable worker in the current `1.3.0` source/deployment release.

Current settlement operations run synchronously through the Control API and its `SettlementRepository`:

- ledger reconciliation;
- explicit wallet adjustments, refunds, and chargebacks;
- usage, revenue, and payout CSV exports;
- payout review and approval routes.

The package currently exports metadata only. It has no queue consumer, scheduler, process entry point, Compose service, retry policy, or independent health endpoint. Operators should not deploy it as a background service.

Promoting this package to a real worker requires an explicit design for job ownership, idempotency, retries, ordering, observability, shutdown, and the transition from synchronous API execution. Those changes affect deployment and consistency guarantees and must be reviewed as a separate feature.
