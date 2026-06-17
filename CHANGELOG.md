# Changelog

All notable changes to ModelFaucet will be documented in this file.

## Unreleased

### Added

- VitePress documentation site configuration and GitHub Pages deployment workflow.
- CI docs-site build verification.
- GitHub issue templates, pull request template, and Dependabot configuration.
- Bilingual documentation site entry points and README links.
- GitHub Actions workflow upgrades with automatic Pages enablement.
- Controlled major dependency upgrade for TypeScript 6, ESLint 10, Vitest 4, root Vite 8, and Zod 4.
- Dependabot npm grouping now only combines minor and patch updates, leaving major updates as separate PRs.

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
