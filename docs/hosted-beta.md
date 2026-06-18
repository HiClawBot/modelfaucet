# Hosted Beta

ModelFaucet `0.9.0` adds a hosted beta deployment contract for small pilot programs. This is a source-beta reference: operators still need a managed PostgreSQL database, secret manager, ingress/TLS, monitoring, backup policy, and deployment-specific runbooks before handling production traffic.

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
API_PUBLIC_BASE_URL
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
SECRET_ENCRYPTION_KEY
ADMIN_TOKEN
DEVELOPER_ADMIN_TOKEN
LITELLM_BASE_URL
LITELLM_MASTER_KEY
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

Set `REQUIRE_HOSTED_PROVIDER=1` before real provider pilot traffic, and `REQUIRE_HOSTED_STRIPE=1` before hosted Stripe top-ups.

## Reference Compose

The reference hosted Compose file is at `infra/hosted/docker-compose.hosted.yml`. It expects an external managed PostgreSQL URL and injects sensitive values from environment variables only.

```bash
docker compose -f infra/hosted/docker-compose.hosted.yml config
docker compose -f infra/hosted/docker-compose.hosted.yml up -d
```

The dashboard build intentionally receives only `VITE_MODELFAUCET_API_BASE_URL`. Do not build a public dashboard bundle with `VITE_MODELFAUCET_DEVELOPER_TOKEN` or `VITE_MODELFAUCET_DEVELOPER_ADMIN_TOKEN`.

## Database And Isolation Checks

Run migrations and seed only against the intended hosted beta database:

```bash
pnpm db:migrate
pnpm db:seed
pnpm hosted:check-isolation
```

`pnpm hosted:check-isolation` verifies that usage events, sessions, provider credentials, and wallets remain bound to the expected app, developer, or end-user owner. It is a read-only check and does not print secrets.

## Readiness Smoke

After ingress and TLS are configured, verify public readiness endpoints:

```bash
MODELFAUCET_API_BASE_URL=https://api.example.com \
MODELFAUCET_GATEWAY_BASE_URL=https://gateway.example.com/v1 \
pnpm hosted:smoke-readiness
```

The smoke script refuses localhost and private-network targets unless `ALLOW_PRIVATE_HOSTED_SMOKE=1` is explicitly set for a controlled private staging check.

## Pilot Onboarding Gates

Before enabling a pilot app:

- Set an explicit app status, CORS origin, rate limit, feature manifest, markup, and revenue share.
- Confirm the app has visible BYOK/local/platform mode controls when those modes are available.
- Set developer and end-user wallet limits suitable for the pilot.
- Verify provider routing with server-side provider keys only.
- Verify Stripe test-mode top-up and webhook delivery before any credit purchase workflow is exposed.
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
