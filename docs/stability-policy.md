# Stability Policy

ModelFaucet `1.0.0` is a source GA release. The public contracts below are considered stable for the `1.x` line unless a security fix requires a narrower emergency change.

## Stable Surfaces

- Control API routes documented in `docs/API_SPEC.md`.
- OpenAI-compatible Gateway routes under `/v1`.
- SDK exports from `@modelfaucet/sdk`.
- React exports from `@modelfaucet/react`.
- Local Bridge loopback HTTP routes.
- PostgreSQL schema objects in `infra/db/schema.sql`.
- Operational scripts documented in the release checklist.

## Security Invariants

- Provider API keys stay server-side only.
- No hidden BYOK markup or hidden BYOK fees.
- Cloud services must not access localhost or private LAN URLs.
- Local model traffic goes through the loopback-bound Local Bridge by default.
- Stored provider secrets are returned only as masked summaries.

## API And SDK Compatibility

Stable API and SDK fields may be extended with optional fields. Existing required request fields, response field names, route names, and exported TypeScript names should not be removed during `1.x` without deprecation.

Breaking changes require:

- A changelog entry.
- Migration notes.
- A deprecation period of at least one minor release when security does not require immediate removal.
- Regression tests for the replacement behavior.

## Database Migration Policy

Schema changes must be forward-only migration steps. Destructive changes require an explicit backup, restore, and rollback note in the release.

For `1.x`, migrations should preserve existing app, developer, wallet, usage, ledger, provider credential, payout, and audit-log data unless the release notes clearly state otherwise.

## Security Patch Policy

Security patches can ship outside the normal release cadence. When a security patch changes behavior, the release must document the affected surface, operator action, and whether key rotation or data review is required.
