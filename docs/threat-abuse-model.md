# Threat And Abuse Model

ModelFaucet `0.8.0` hardens the source beta before hosted pilots. This document
tracks the highest-risk misuse paths and the controls that must remain intact in
every release.

## Security Invariants

1. Provider API keys stay server-side only.
2. BYOK behavior is explicit; hidden BYOK markup is not allowed.
3. Cloud services must not access localhost, metadata services, or private LAN URLs.
4. Local Bridge access to localhost/LAN is allowed only because it runs inside the
   user's local trust boundary.
5. Money movement must be auditable before payout transitions.

## Threat Model

| Threat | Impact | Current controls |
| --- | --- | --- |
| Client bundle contains provider credentials | Provider account compromise | Provider keys are accepted only by server routes, encrypted before persistence, masked in responses, and scanned by `pnpm verify:secrets`. |
| BYOK base URL targets private network | SSRF against local, LAN, or metadata services | Shared `CloudSafeBaseUrlSchema` blocks localhost, private IPv4, carrier NAT, link-local, private IPv6, IPv4-mapped IPv6, and known metadata hostnames. |
| Production CORS defaults to wildcard | Cross-site abuse of token/session APIs | `API_CORS_ORIGINS` and `GATEWAY_CORS_ORIGINS` are required in production and cannot be `*`. |
| Stolen session token is replayed | Unauthorized model usage | Tokens are short-lived, stored hashed, and validated against active app/developer/session records. |
| Provider failure leaks secrets in responses | Secret disclosure | Gateway provider attempt metadata includes status/error class only, not bearer credentials. |
| Payout marked paid without review | Unapproved money movement | `mark-paid` requires prior payout approval through `processing`; all transitions write audit logs. |
| Dependency with known high vulnerability ships | Supply-chain exposure | CI runs `pnpm security:audit` at high severity and `pnpm verify:secrets`. |

## Abuse Model

| Abuse case | Detection signals | Controls |
| --- | --- | --- |
| Credit farming through many users | High session creation rate, repeated IP/device pattern, wallet failures | IP+route rate limits, wallet balance checks, future device/app-level velocity limits. |
| Developer creates abusive app | New app traffic spike, high provider error rate, suspicious feature metadata | Developer admin review, audit logs, app status controls, roadmap tenant isolation checks. |
| BYOK used to hide platform costs | Unexpected route/cost mismatch | BYOK records zero platform upstream cost and explicit route mode. |
| Provider-key budget exhaustion | Developer-key spend approaches limit | Gateway budget checks before developer-key routing. |
| Webhook replay duplicates credit | Repeated Stripe event/session IDs | Top-up crediting is idempotent by Stripe event/session state. |
| Payout fraud | Payout velocity, mismatched ledger reconciliation, unreviewed status | Ledger reconciliation, payout approval gate, audit logs, pending/processing status review. |

## Release Regression Requirements

Before tagging a release:

- Run `pnpm verify:secrets`.
- Run `pnpm security:audit`.
- Run lint, typecheck, and tests.
- Run docs build and app builds.
- Run local smoke with ledger reconciliation.
- Confirm no API response or dashboard surface returns raw provider keys.
- Confirm production CORS cannot boot without explicit allowlists.
- Confirm cloud provider URL paths reject localhost, private LAN, metadata, and IPv4-mapped private hosts.

## Hosted Pilot Gaps

These remain required before hosted beta:

- Real secret manager integration.
- Tenant/app isolation tests against hosted data stores.
- WAF or edge rate limits in front of API and Gateway.
- Provider and Stripe test accounts with alerting.
- KYC/AML workflow for real payouts.
- Incident response contacts and key-rotation runbook.
