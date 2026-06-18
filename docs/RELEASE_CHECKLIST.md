# Release Checklist

Use this checklist before tagging a prerelease, publishing packages, or deploying a hosted ModelFaucet environment.

## Source prerelease or private beta

- `pnpm install --frozen-lockfile` completes.
- `pnpm deps:review` has been reviewed before release.
- `pnpm verify:secrets` reports no high-confidence raw secrets.
- `pnpm ga:verify` passes for a source GA release.
- `pnpm hosted:verify-env` passes with the target hosted environment variables or with CI-safe placeholders for source validation.
- `pnpm security:audit` reports no high-severity production dependency advisories.
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm smoke:local` passes against a seeded local PostgreSQL database.
- `pnpm hosted:check-isolation` passes against a freshly migrated and seeded PostgreSQL database.
- `pnpm --filter @modelfaucet/dashboard build` passes.
- `pnpm --filter crm-demo build` passes.
- `pnpm website:build` passes.
- `pnpm docs:build` passes.
- `pnpm pages:build` passes and preserves the website root plus existing docs paths.
- `pnpm db:migrate` and `pnpm db:seed` have been run against a fresh PostgreSQL database.
- `pnpm compose:verify` validates default and hosted Compose configs on a Docker-capable machine.
- README quickstart still matches the repository scripts and ports.
- Provider API keys are only documented as server-side environment variables.
- Developer access uses scoped `mf_dev_` API tokens for production workflows; `DEVELOPER_ADMIN_TOKEN` is reserved for bootstrap/operator-only contexts.
- The public website and scenario demo remain static and do not collect or render provider API key inputs.
- BYOK flows expose visible user controls and no hidden markup or hidden fees.
- Cloud services are not configured to access localhost, loopback, link-local, or private LAN URLs.
- Production deployments set explicit `API_CORS_ORIGINS` and `GATEWAY_CORS_ORIGINS`.

## Source GA release

- Stable API, SDK, database migration, and security policies are published.
- Migration and upgrade guides are published in English and Simplified Chinese.
- Production reference architecture is published.
- Governance, maintainership, support policy, release cadence, and security intake are published.
- Package and container publishing strategy is decided and documented.
- Hosted production blockers are explicitly documented instead of treated as completed source checks.

## Hosted production release

- Docker Compose smoke test has been run on a machine with Docker available.
- `pnpm hosted:verify-env` passes with `REQUIRE_HOSTED_PROVIDER=1` before real provider traffic.
- `pnpm hosted:verify-env` passes with `REQUIRE_HOSTED_STRIPE=1` before hosted Stripe top-ups.
- `pnpm hosted:smoke-readiness` passes against the hosted API and Gateway public URLs.
- `pnpm hosted:check-isolation` passes against the hosted beta database after migration.
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
