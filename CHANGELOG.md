# Changelog

All notable changes to ModelFaucet will be documented in this file.

## Unreleased

## 1.2.0 - 2026-06-18

### Added

- Independent bilingual React website under `apps/website` for the GitHub Pages root experience.
- Static scenario model for platform credits, BYOK gateway fees, and Local Bridge software fees without collecting provider keys.
- Website use-case sections for SaaS, browser extension, desktop, commerce, and internal knowledge workflows.
- `pnpm website:build` and `pnpm pages:build` scripts for website and merged GitHub Pages artifact builds.
- Pages build script that preserves VitePress docs paths while publishing website root, `/demo/`, and `/use-cases/`.

### Changed

- Pages workflow now publishes a merged `.pages-dist` artifact instead of only `docs/.vitepress/dist`.
- CI now verifies website and merged Pages artifact builds.
- README, docs homepage, roadmap, release checklist, and GA readiness verification now reflect the `1.2.0` website and scenario demo release.

## 1.1.0 - 2026-06-18

### Added

- Scoped developer API token lifecycle APIs for create, list, and revoke.
- `developer_api_tokens` database table with hash-only token storage, token prefixes, scopes, expiry, revocation, and audit logging.
- API-level tests for developer token scope denial, tenant-filtered app listing, one-time raw token return, and developer provider-key ownership.
- English and Simplified Chinese developer auth and tenant-control guides.

### Changed

- Developer console and developer provider-key routes now accept scoped developer API tokens in addition to the bootstrap developer admin token.
- PostgreSQL developer console and developer provider-key repositories now accept a developer filter and constrain token-authenticated operations to the owning developer.
- README, docs homepage, roadmap, and GA readiness verification now reflect the `1.1.0` auth hardening release.

## 1.0.1 - 2026-06-18

### Added

- Hardening patch with reusable `pnpm compose:verify` for default and hosted Docker Compose config validation.
- `pnpm deps:review` dependency review command for release preparation.
- English and Simplified Chinese deployment validation guides covering Docker/Compose, secret manager, CORS, readiness, and database checks.

### Changed

- CI now uses `pnpm compose:verify` for Compose validation.
- GA readiness verification now checks deployment validation docs and the Compose/dependency review scripts.
- README and docs homepage now reflect the `1.0.1` source GA hardening patch.

## 1.0.0 - 2026-06-18

### Added

- General availability stability policy for API, SDK, database migration, and security contracts.
- Migration and upgrade guides in English and Simplified Chinese.
- Production reference architecture docs in English and Simplified Chinese.
- Governance, maintainership, support policy, release cadence, and security intake docs.
- Package and container publishing strategy docs.
- `pnpm ga:verify` GA readiness verifier.

### Changed

- CI now runs GA readiness verification.
- README, docs homepage, release checklist, and roadmap now reflect the `1.0.0` source GA status.

## 0.9.0 - 2026-06-18

### Added

- Hosted beta environment verifier for production env, public URLs, CORS allowlists, secret shape, contact paths, optional provider-key enforcement, and optional Stripe enforcement.
- Hosted tenant/app isolation SQL checks for usage events, sessions, provider credentials, and wallets.
- Hosted readiness smoke script for public API/Gateway readiness, metrics, and provider health endpoints.
- Hosted reference Docker Compose stack with external PostgreSQL, Redis, LiteLLM, API, Gateway, and Dashboard services.
- `.env.hosted.example` secret inventory template.
- English and Simplified Chinese hosted beta guides with pilot onboarding gates, acceptable-use policy, and incident-response contact template.

### Changed

- CI now validates the hosted environment contract, hosted tenant isolation check, and hosted Docker Compose configuration.
- README, docs homepage, release checklist, and roadmap now reflect the `0.9.0` hosted source-beta status.

## 0.8.0 - 2026-06-18

### Added

- Threat and abuse model documentation in English and Simplified Chinese.
- Expanded private-network URL guard coverage for carrier NAT, metadata hostnames, IPv4-mapped IPv6, unspecified IPv6, and alternate localhost IPv4 notation.
- Production CORS allowlist requirements for API and Gateway via `API_CORS_ORIGINS` and `GATEWAY_CORS_ORIGINS`.
- API and Gateway CORS/env regression tests.
- `pnpm security:audit` dependency audit script.

### Changed

- CI now runs dependency audit in addition to secret scanning, schema/seed verification, lint, typecheck, tests, smoke, app builds, and docs build.
- Security documentation now reflects the 0.8 source-beta acceptance checklist.

## 0.7.0 - 2026-06-18

### Added

- Admin ledger reconciliation endpoint that reconstructs wallet balances from ledger entries.
- Admin wallet adjustment/refund/chargeback endpoint with idempotency support, audit logs, and ledger entries.
- Payout approval endpoint and payout state gate requiring `processing` before `mark-paid`.
- Admin CSV exports for usage, revenue, and payouts.
- Stripe webhook replay script for local/test-mode verification.
- English and Simplified Chinese billing and settlement guides.

### Changed

- Local seed data now records demo opening credits as a ledger entry so reconciliation can close on fresh databases.
- Local smoke test now verifies ledger reconciliation after a gateway request.

## 0.6.0 - 2026-06-18

### Added

- API and Gateway request IDs via `x-request-id`, including automatic request IDs in error responses.
- API and Gateway `/ready` endpoints for shallow container readiness checks.
- API and Gateway Prometheus-style `/metrics` endpoints for request totals, duration sums, and rate-limit counters.
- In-memory API and Gateway rate limiters with configurable window and request count.
- Operations runbook covering request tracing, readiness, metrics, rate limits, migration rollback, backup, and restore.
- English and Simplified Chinese operations guides.

## 0.5.0 - 2026-06-18

### Added

- SDK `runFeature` command-style API with normalized text, usage, and ModelFaucet metadata.
- SDK Local Bridge diagnostics helpers and in-memory offline local usage-report queue with flush support.
- React `FaucetFeatureCommand` and `FaucetUsage` components.
- Local Bridge `/diagnostics` endpoint for loopback/upstream checks without exposing upstream API keys.
- Browser extension and desktop app integration notes that keep provider keys out of client bundles.
- English and Simplified Chinese SDK and Local Bridge guides.

## 0.4.0 - 2026-06-18

### Added

- Developer console API for app create/list/update/archive workflows.
- Feature manifest API for route policy and pricing JSON create/list/update/delete workflows.
- Operations API for wallets, Stripe test top-ups, payouts, and audit-log review.
- Dashboard Apps, Features, and Operations pages with component coverage for key states.
- API and dashboard tests for developer-console authorization, CRUD workflows, and secret-free operations responses.

## 0.3.0 - 2026-06-18

### Added

- Provider timeout, retry, and retry-delay controls for the Gateway LiteLLM client.
- Sanitized provider attempt metadata and `/health/providers`.
- Provider usage reconciliation for missing or inconsistent token usage fields.
- BYOK/developer-key fallback-to-platform controls when credentials or feature policy explicitly allow fallback.
- Explicit streaming guard for `stream: true` until streaming ledger accounting is implemented.
- `pnpm smoke:provider` for real-provider route verification using server-side LiteLLM environment only.
- English and Simplified Chinese provider routing guides.

## 0.2.0 - 2026-06-18

### Added

- VitePress documentation site configuration and GitHub Pages deployment workflow.
- CI docs-site build verification.
- GitHub issue templates, pull request template, and Dependabot configuration.
- Bilingual documentation site entry points and README links.
- GitHub Actions workflow upgrades with automatic Pages enablement.
- Controlled major dependency upgrade for TypeScript 6, ESLint 10, Vitest 4, root Vite 8, and Zod 4.
- Dependabot npm grouping now only combines minor and patch updates, leaving major updates as separate PRs.
- English and Simplified Chinese roadmap pages for the path from source MVP to hosted beta and GA.
- Local OpenAI-compatible mock provider for zero-secret smoke testing.
- `pnpm smoke:local` end-to-end smoke test covering sessions, gateway routing, usage, ledger entries, and dashboard aggregates.
- `pnpm db:reset:dev` for repeatable local demo database resets.
- Docker Compose application stack for API, Gateway, Dashboard, CRM demo, LiteLLM, Redis, PostgreSQL, and the local mock provider.
- English and Simplified Chinese local smoke test guides.

## 0.1.0 - 2026-06-17

### Added

- Monorepo bootstrap with TypeScript, Go, pnpm, Turbo, ESLint, and tests.
- PostgreSQL schema and development seed data.
- Control API sessions, wallet lookup, provider-key management, Stripe test top-ups, and payout mock endpoints.
- OpenAI-compatible gateway with LiteLLM integration, BYOK routing, developer-key routing, budget enforcement, usage events, and ledger writes.
- Shared schemas, pricing helpers, rating worker, transactional ledger service, SDK, React components, dashboard, and CRM demo.
- Loopback-bound local bridge for local OpenAI/Ollama-compatible model endpoints.
- Launch-prep docs, Apache-2.0 license, and CI workflow.

### Security

- Provider API keys are accepted only by explicit server API endpoints and stored encrypted at rest.
- API responses expose masked key summaries only.
- Cloud-side provider base URLs reject localhost and private LAN addresses.
- Local model traffic is routed through the loopback-bound local bridge.
