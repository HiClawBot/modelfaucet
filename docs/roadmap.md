# Roadmap

This roadmap starts from the current source MVP and turns ModelFaucet into a production-ready open-source platform. Version names are planning targets, not promises. Each release should keep the core security boundaries intact:

- Provider API keys stay server-side only.
- BYOK uses explicit visible user controls, with no hidden markup.
- Cloud services never fetch localhost, loopback, link-local, or private LAN URLs.

## Baseline

ModelFaucet `0.8.0` is a source beta. It includes the Control API, Gateway, Dashboard, SDK, React package, CRM demo, Local Bridge, wallet credits, Stripe test-mode top-ups, payout review, ledger reconciliation, CSV settlement reports, security hardening checks, bilingual README, docs site, CI, and major dependency compatibility upgrades.

Current production blockers:

- Docker smoke testing needs to run on a Docker-capable machine.
- Real LiteLLM provider routing needs a server-side test key.
- Stripe Checkout and webhook delivery need hosted or Stripe CLI verification.
- Deployment secrets need KMS, Vault, or cloud secret-manager wiring.
- Database backup, restore, retention, and migration procedures need deployment-specific documentation.
- Rate limits, abuse controls, and payout policy need production review.

## Release Train

| Version | Theme | Primary Outcome |
| --- | --- | --- |
| `0.1.x` | Stability and documentation | Keep the MVP installable, documented, and dependency-current. |
| `0.2.0` | Local production smoke | Docker stack, migrations, seed data, and demo flows work end to end. |
| `0.3.0` | Provider routing beta | Real provider routing through LiteLLM is reliable and observable. |
| `0.4.0` | Developer console beta | App, feature, key, wallet, usage, and revenue operations are usable in the dashboard. |
| `0.5.0` | SDK and Local Bridge beta | Web SDK, React package, and local model workflows are production-shaped. |
| `0.6.0` | Operations and observability | Operators can debug, meter, rate-limit, and recover the system. |
| `0.7.0` | Billing and settlement beta | Credits, Stripe top-ups, ledger reconciliation, and payout review are auditable. |
| `0.8.0` | Security hardening | Threat model, abuse controls, secret handling, and private-network protections are hardened. |
| `0.9.0` | Hosted beta | A hosted environment can onboard real pilot developers safely. |
| `1.0.0` | General availability | Stable APIs, migration policy, support paths, and production operating playbooks. |

## `0.1.x` Stability Track

Goal: keep the current source release healthy while larger features are developed.

Scope:

- Patch dependency and workflow updates.
- Keep README, docs site, and release checklist accurate.
- Add regression tests for each bug fix.
- Improve issue templates, labels, and contributor guidance.
- Publish signed tags only after CI and docs deploy are green.

Exit criteria:

- `pnpm verify:secrets`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, app builds, and docs build pass locally and in CI.
- `pnpm outdated -r` is reviewed before each patch release.
- No open high-severity security or data-integrity bugs.

## `0.2.0` Local Production Smoke

Goal: make a new contributor or pilot user able to run the complete system locally with Docker.

Status: implemented in source. Local non-Docker smoke is covered by `pnpm smoke:local`; Docker Compose syntax is validated in CI and can be run on Docker-capable machines.

Scope:

- Validate `docker compose up` for PostgreSQL, Redis, LiteLLM, API, Gateway, Dashboard, and CRM demo.
- Add a single smoke-test command for migrate, seed, session creation, gateway call, usage row, ledger entries, and dashboard aggregate.
- Document `.env` setup with safe placeholders only.
- Add database reset and fixture commands for repeatable demos.
- Add local failure-mode docs for missing provider keys, empty wallet balance, and unavailable LiteLLM.

Exit criteria:

- Fresh checkout to working demo in under 15 minutes on macOS and Linux.
- Docker smoke test passes without exposing raw provider keys.
- Platform route, BYOK route, and local route each have a documented smoke path.

## `0.3.0` Provider Routing Beta

Goal: make cloud model routing credible for real test traffic.

Status: implemented in source. Provider requests now have timeout/retry controls, sanitized attempt metadata, provider health checks, usage reconciliation, explicit streaming guards, and server-side real-provider smoke support.

Scope:

- Verify LiteLLM with at least one real server-side test provider key.
- Add provider health checks, timeouts, retries, and structured provider errors.
- Add streaming response support where provider adapters support it.
- Add fallback order and per-feature route policy controls.
- Add token usage reconciliation when provider-reported usage is missing or inconsistent.

Exit criteria:

- Real provider smoke test passes with the provider key only in server-side environment or secret manager configuration.
- Gateway never calls private-network provider URLs in production.
- Provider failures produce actionable, non-secret logs and client-safe error responses.

## `0.4.0` Developer Console Beta

Goal: turn the dashboard from an MVP viewer into a usable developer console.

Status: implemented in source. The dashboard now includes Apps, Features,
Operations, Usage, Revenue, and Provider Keys pages backed by developer-console
APIs protected by the developer admin token.

Scope:

- App and feature CRUD with validation.
- Feature-level route policy, markup, revenue share, and budget controls.
- Provider key management UX with visible BYOK/developer-key semantics.
- Wallet, top-up, usage, revenue, and payout review pages.
- Audit log viewer for sensitive actions.

Exit criteria:

- A pilot developer can onboard an app without editing seed SQL.
- Sensitive forms clear raw key input after submit and never render stored secrets.
- Dashboard routes have component tests for key states and error handling.

## `0.5.0` SDK And Local Bridge Beta

Goal: make integration pleasant for real app developers.

Status: implemented in source. The SDK now includes command-style feature calls,
local diagnostics, and offline local usage-report buffering; React includes
command and usage display components; Local Bridge exposes diagnostics while
remaining loopback-bound by default.

Scope:

- Stabilize `@modelfaucet/sdk` public types and package exports.
- Add React component variants for chat, command-style feature calls, and usage display.
- Add browser extension and desktop-app integration examples.
- Improve Local Bridge installation, config, logs, and health diagnostics.
- Add local usage-report buffering when cloud reporting is temporarily unavailable.

Exit criteria:

- SDK has a documented semver compatibility policy.
- Example apps cover platform, BYOK, and local mode without provider keys in client code.
- Local Bridge remains loopback-bound by default and does not widen network exposure silently.

## `0.6.0` Operations And Observability

Goal: make the system operable under real traffic.

Status: implemented in source. API and Gateway now emit request IDs, expose
readiness and Prometheus-style metrics endpoints, and include configurable
in-memory rate limits with operations runbooks for rollback, backup, and restore.

Scope:

- Structured logs with request IDs across API, Gateway, and workers.
- Metrics for latency, token usage, route mode, provider errors, wallet failures, and ledger writes.
- Rate limits by app, feature, wallet, developer key, session, and IP where applicable.
- Admin health and readiness endpoints.
- Migration rollback and backup/restore runbooks.

Exit criteria:

- A failed request can be traced from SDK call to provider response or ledger rejection.
- Operators can distinguish provider failures, wallet failures, validation failures, and abuse throttling.
- Backup and restore procedure is tested on a non-production database.

## `0.7.0` Billing And Settlement Beta

Goal: make money movement auditable before any real payout workflow.

Status: implemented in source. Admin APIs now cover ledger reconciliation, wallet
adjustment/refund/chargeback events, payout approval before mark-paid, and CSV
exports for usage, revenue, and payouts. The local smoke test checks ledger
reconciliation, and `pnpm stripe:webhook:replay` supports Stripe test-mode replay
verification.

Scope:

- Stripe Checkout and webhook delivery verified in test mode.
- Ledger reconciliation job for wallet balances and usage events.
- Payout review workflow with manual approval gates.
- Refund, adjustment, and chargeback accounting model.
- Exportable CSV reports for usage, revenue, and payout periods.

Exit criteria:

- Stripe test card top-up and webhook replay are verified end to end.
- Ledger balance reconstruction matches wallet balances.
- No real-money payout can be triggered without explicit operator approval.

## `0.8.0` Security Hardening

Goal: reduce risk before hosted beta.

Status: implemented in source. The release adds a threat/abuse model, expanded
SSRF/private-network URL guard coverage, production CORS allowlist requirements
for API and Gateway, dependency audit in CI, and security acceptance checklist
updates.

Scope:

- Update threat model and abuse model.
- Add SSRF and private-network guard regression tests across every provider URL path.
- Add secret redaction tests for logs, API responses, and dashboard rendering.
- Review CORS, auth, token expiry, request body limits, and admin-token handling.
- Add dependency, container, and secret scanning to release workflows.

Exit criteria:

- No known route allows cloud-side access to localhost or private LAN targets.
- Provider keys are accepted only through explicit server endpoints and never exposed in client bundles.
- Security release checklist passes before any hosted pilot.

## `0.9.0` Hosted Beta

Goal: onboard a small number of pilot developers safely.

Scope:

- Deploy API, Gateway, Dashboard, workers, PostgreSQL, Redis, and LiteLLM to a managed environment.
- Use a real secret manager for all sensitive values.
- Add tenant and app isolation checks.
- Add operational alerting and incident-response contacts.
- Publish hosted beta documentation and acceptable-use policy.

Exit criteria:

- Pilot apps can run real traffic with monitored cost and usage limits.
- Support, abuse, and security contact paths are public.
- Hosted beta has rollback, restore, and emergency key-rotation procedures.

## `1.0.0` General Availability

Goal: declare stable public contracts and production operating expectations.

Scope:

- Freeze stable API and SDK surfaces with deprecation policy.
- Publish migration and upgrade guides.
- Publish production deployment reference architecture.
- Finalize governance, maintainership, support policy, and release cadence.
- Decide package publishing and container image publishing strategy.

Exit criteria:

- All release checklist items pass for source, packages, containers, and hosted deployment.
- API, SDK, database migration, and security policies are documented.
- Production incidents can be triaged with available logs, metrics, runbooks, and rollback paths.

## Operating Rules For Every Release

- Run secret scan, lint, typecheck, tests, docs build, and relevant app builds before tagging.
- Add or update tests for every bug fix and security rule.
- Keep provider API keys out of client code, docs examples, and hidden markup.
- Keep BYOK pricing and route behavior explicit to users.
- Keep private-network URL guards centralized and covered by regression tests.
- Update the changelog, release checklist, and roadmap when scope changes.
