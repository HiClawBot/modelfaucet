# Hosted Beta

ModelFaucet `v1.3.0-beta.1` is a published source and container prerelease that defines the deployment contract for small, invite-only pilot programs. Its immutable images and provenance are available, but operators still need a managed PostgreSQL database, managed Redis, secret manager, ingress/TLS, monitoring, backup policy, and deployment-specific runbooks before handling real traffic.

## Security Boundaries

The hosted beta must keep these rules intact:

- Provider API keys are server-side only. Do not put provider keys in Vite, dashboard, CRM demo, SDK, React, browser extension, or mobile client environment variables.
- BYOK must be visible and explicit to the end user. Do not add hidden BYOK markup, hidden spread, or hidden fees.
- Cloud services must not fetch localhost, metadata endpoints, link-local addresses, or private LAN URLs supplied by users or providers.

## Environment Contract

Use `.env.hosted.example` as the inventory template, then store real values in KMS, Vault, a cloud secret manager, or a private deployment environment. Do not commit populated env files.

Required public configuration:

```txt
NODE_ENV=production
HOSTED_ENVIRONMENT
HOSTED_SECRET_MANAGER
MODELFAUCET_API_IMAGE
MODELFAUCET_GATEWAY_IMAGE
MODELFAUCET_DASHBOARD_IMAGE
API_PUBLIC_BASE_URL
DASHBOARD_PUBLIC_APP_ID
GATEWAY_PUBLIC_BASE_URL
DASHBOARD_PUBLIC_BASE_URL
PUBLIC_SUPPORT_URL
API_CORS_ORIGINS
GATEWAY_CORS_ORIGINS
SECURITY_CONTACT_EMAIL
ABUSE_CONTACT_EMAIL
INCIDENT_CONTACT_EMAIL
```

Required server-side secrets:

```txt
DATABASE_URL
REDIS_URL
SECRET_ENCRYPTION_KEY
ADMIN_TOKEN
DEVELOPER_ADMIN_TOKEN
LITELLM_BASE_URL
LITELLM_MASTER_KEY
METRICS_TOKEN
```

Required server-side billing policy (configuration, not secrets):

```txt
GATEWAY_PLATFORM_MODEL
GATEWAY_PLATFORM_INPUT_PRICE_PER_1M_TOKENS_USD
GATEWAY_PLATFORM_OUTPUT_PRICE_PER_1M_TOKENS_USD
GATEWAY_PLATFORM_MARKUP_PERCENT
GATEWAY_PLATFORM_MAX_INPUT_TOKENS
GATEWAY_PLATFORM_MAX_OUTPUT_TOKENS
GATEWAY_RESERVATION_TTL_MS
TRUST_PROXY_HOPS
API_SESSION_RATE_LIMIT_MAX_REQUESTS
API_SESSION_RATE_LIMIT_WINDOW_MS
API_PLATFORM_ONLY=1
GATEWAY_PLATFORM_ONLY=1
API_REQUIRE_SESSION_ORIGIN=1
API_ENABLE_STRIPE_PAYMENTS=0
API_ENABLE_PAYOUTS=0
API_ENABLE_PROVIDER_KEYS=0
API_ENABLE_TEST_CREDITS=0
```

Optional server-side secrets, required before the corresponding pilot traffic is enabled:

```txt
OPENAI_API_KEY
OPENROUTER_API_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

Run the environment verifier before deployment:

```bash
pnpm hosted:verify-env
```

Each image value must be the exact `ghcr.io/...@sha256:<64 hex>` reference
written by the tagged `container-images` workflow. Release tags are discovery
labels only; hosted Compose never deploys a mutable tag.

Set `REQUIRE_HOSTED_PROVIDER=1` before real provider pilot traffic, and `REQUIRE_HOSTED_STRIPE=1` before hosted Stripe top-ups.

## Platform Route Billing Contract

The first Beta must map `GATEWAY_PLATFORM_MODEL` to exactly one reviewed
LiteLLM model or alias. Configure its positive input/output token prices from
the provider's active price sheet, then record the source and effective date in
the deployment change log. Do not point this policy at a dynamic alias whose
possible providers or prices differ.

The Gateway rejects client-selected platform models, enforces the configured
input/output caps, and reserves the worst-case retail price from spendable
wallet balance before calling LiteLLM. It settles from provider-reported token
usage and server-side prices. A timed-out reservation or uncertain settlement
is held as `requires_review`; it must not be silently released or retried until
an operator reconciles it with provider request logs.

## Reference Compose

The reference hosted Compose file is at `infra/hosted/docker-compose.hosted.yml`. It expects an external managed PostgreSQL URL and injects sensitive values from environment variables only.

```bash
docker compose -f infra/hosted/docker-compose.hosted.yml config
docker compose -f infra/hosted/docker-compose.hosted.yml up -d
```

The dashboard receives only `MODELFAUCET_API_BASE_URL` and
`MODELFAUCET_PUBLIC_APP_ID` at container runtime. An operator or pilot enters a
scoped, expiring developer token in the UI; it is held in `sessionStorage` and
removed on disconnect. Never inject developer or operator tokens into the
image, runtime config script, URL, or browser-visible environment variables.

## Database And Isolation Checks

Review and run ordered migrations only against the intended hosted Beta database. `infra/db/seed.sql` is development/CI-only and must never run in staging or production:

```bash
pnpm db:migration:plan
pnpm db:migrate
pnpm db:verify-migrations
pnpm hosted:check-isolation
```

For a new pilot, create the developer, app, system wallets, and zero-balance developer wallet with `pnpm db:bootstrap:production`; see [Operations](./operations.md) for the required variables. The bootstrap is idempotent and does not create end users, credits, or ledger entries.

`pnpm hosted:check-isolation` verifies that usage events, sessions, provider credentials, and wallets remain bound to the expected app, developer, or end-user owner. It is a read-only check and does not print secrets.

## Readiness Smoke

After ingress and TLS are configured, verify public readiness endpoints:

```bash
MODELFAUCET_API_BASE_URL=https://api.example.com \
MODELFAUCET_GATEWAY_BASE_URL=https://gateway.example.com/v1 \
MODELFAUCET_METRICS_TOKEN="$METRICS_TOKEN" \
pnpm hosted:smoke-readiness
```

The smoke requires healthy API/Gateway dependency checks, authenticated metrics,
and a healthy provider response. It refuses localhost and private-network targets
unless `ALLOW_PRIVATE_HOSTED_SMOKE=1` is explicitly set for a controlled private
staging check.

## Billable Canary And Soak

Readiness never generates a completion. After an operator has funded the
staging canary wallet and approved provider cost, run one low-token golden path:

```bash
ALLOW_PROVIDER_BILLING=1 \
MODELFAUCET_API_BASE_URL=https://api.example.com \
MODELFAUCET_GATEWAY_BASE_URL=https://gateway.example.com/v1 \
MODELFAUCET_PUBLIC_APP_ID=app_staging_canary \
MODELFAUCET_CANARY_ORIGIN=https://pilot.example.com \
MODELFAUCET_CANARY_MODEL=reviewed-provider-model \
MODELFAUCET_CANARY_MAX_TOKENS=8 \
pnpm hosted:smoke-canary
```

The canary creates a session, sends one billable completion, replays the exact
request with the same idempotency key, and requires the same request ID and
content. It prints no session or provider secret. Reconcile its request ID with
the usage ledger and the provider bill before promotion.

The release soak uses the same path. Its production acceptance run defaults to
60 minutes, one worker, at most 360 billable calls, a 1% failure-rate ceiling,
and a 10-second p95 limit. Short runs require `ALLOW_SHORT_SOAK=1` and are only
script checks, not release evidence:

```bash
ALLOW_PROVIDER_BILLING=1 \
SOAK_DURATION_SECONDS=3600 \
SOAK_MAX_RUNS=360 \
SOAK_REPORT_FILE=/secure/evidence/modelfaucet-soak.json \
pnpm hosted:soak
```

Use the same `MODELFAUCET_*` canary variables as above. The report path must not
already exist, preventing accidental evidence overwrite.

## Pilot Onboarding Gates

Before enabling a pilot app:

- Set an explicit app status, CORS origin, rate limit, feature manifest, server-side model/prices, markup, token caps, and revenue share.
- Keep BYOK, developer-key routing, Local Bridge, payment, payout, test-credit, streaming, Responses, and Embeddings disabled for the first hosted Beta.
- Set exact HTTPS origins plus app-monthly and per-session spend limits suitable for the pilot.
- Verify the single platform route with a server-side provider key only.
- Do not expose credit purchase until a later release has passed Stripe test-mode and webhook staging gates.
- Record support, abuse, security, and incident contacts in the deployment notes.

## Acceptable Use Policy

Hosted beta pilots must not use ModelFaucet for credential theft, malware, spam, evasion of access controls, harassment, illegal surveillance, regulated advice without required review, or attempts to make ModelFaucet cloud services access localhost, metadata services, link-local hosts, or private LAN resources.

Operators may throttle, suspend, or disable apps, sessions, keys, or wallets when abuse, runaway spend, payment risk, or security risk is detected.

## Incident Response

Minimum hosted beta contacts:

```txt
support:  PUBLIC_SUPPORT_URL
security: SECURITY_CONTACT_EMAIL
abuse:    ABUSE_CONTACT_EMAIL
incident: INCIDENT_CONTACT_EMAIL
```

Minimum response playbook:

- Triage by request ID, app, developer, route mode, provider, and wallet.
- Disable affected app, feature, provider credential, session, or payout workflow.
- Rotate provider keys, LiteLLM master key, admin tokens, and encryption keys when exposure is suspected.
- Preserve audit logs, usage events, ledger entries, and provider attempt metadata.
- Restore from the most recent tested backup if data integrity is affected.
- Publish a pilot-facing incident note when user impact or billing impact is confirmed.
