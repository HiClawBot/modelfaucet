# Publishing Strategy

ModelFaucet `1.0.0` is published as a source GA release on GitHub. Package and container publishing should use the strategy below once registry ownership and automation credentials are configured.

## Source Publishing

The source release is the authoritative artifact for `1.0.0`:

- Git tag: `v1.0.0`
- GitHub Release notes in English and Simplified Chinese.
- CI and docs workflows green on the release commit.
- No generated build artifacts or local env files committed.

## Package Publishing

Planned npm packages:

- `@modelfaucet/sdk`
- `@modelfaucet/react`

Before npm publishing:

- Verify npm namespace ownership.
- Remove `private` only for packages intended to publish.
- Confirm package exports, types, README, license, and semver policy.
- Run `pnpm verify:secrets`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.

Provider API keys must never be represented as client package defaults.

## Container Image Publishing

Planned container registry:

- `ghcr.io/hiclawbot/modelfaucet-api`
- `ghcr.io/hiclawbot/modelfaucet-gateway`
- `ghcr.io/hiclawbot/modelfaucet-dashboard`

Recommended tags:

- `1.0.0`
- `1.0`
- `latest` only after release validation.

Container publishing must include image scanning, build provenance where available, and a smoke test against a disposable database.

## Hosted Deployment Publishing

Hosted deployments should be promoted separately from source tags. A source release can be GA while a particular hosted environment remains blocked on cloud-specific checks, real provider smoke, Stripe webhook delivery, backup verification, or registry setup.
