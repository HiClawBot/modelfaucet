# Changelog

All notable changes to ModelFaucet will be documented in this file.

## Unreleased

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
