# Release Checklist

Use this checklist before tagging a prerelease, publishing packages, or deploying a hosted ModelFaucet environment.

## Source prerelease or private beta

- `pnpm install --frozen-lockfile` completes.
- `pnpm verify:secrets` reports no high-confidence raw secrets.
- `pnpm security:audit` reports no high-severity production dependency advisories.
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm smoke:local` passes against a seeded local PostgreSQL database.
- `pnpm --filter @modelfaucet/dashboard build` passes.
- `pnpm --filter crm-demo build` passes.
- `pnpm docs:build` passes.
- `pnpm db:migrate` and `pnpm db:seed` have been run against a fresh PostgreSQL database.
- README quickstart still matches the repository scripts and ports.
- Provider API keys are only documented as server-side environment variables.
- BYOK flows expose visible user controls and no hidden markup or hidden fees.
- Cloud services are not configured to access localhost, loopback, link-local, or private LAN URLs.
- Production deployments set explicit `API_CORS_ORIGINS` and `GATEWAY_CORS_ORIGINS`.

## Hosted production release

- Docker Compose smoke test has been run on a machine with Docker available.
- A real LiteLLM test route has been verified with a test provider key stored only in server-side environment or secret manager configuration.
- Stripe Checkout has been verified in test mode with a real test card.
- Stripe webhook delivery has been verified with Stripe CLI or hosted webhook delivery.
- Production `SECRET_ENCRYPTION_KEY`, JWT secret, admin tokens, and provider secrets are provisioned through KMS, Vault, or a cloud secret manager.
- Database backups, migrations, retention, and restore procedures have been documented for the deployment target.
- Rate limits, request body limits, and gateway timeout values have been reviewed for the deployment target.
- Payout workflow has been reviewed before enabling any real-money settlement.
- GitHub, npm, container registry, domain, and trademark namespace checks are complete.
- Public support, abuse, security, and maintainer contact paths are published.

## Tagging

- `CHANGELOG.md` has an entry for the release.
- `README.md` status text matches the release level.
- CI is green on the release commit.
- The tag uses the package version from `package.json`.
- Generated build artifacts and local environment files are not committed.
