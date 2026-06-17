# Changelog

All notable changes to ModelFaucet will be documented in this file.

## Unreleased

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
