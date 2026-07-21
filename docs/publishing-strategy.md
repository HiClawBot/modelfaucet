# Publishing Strategy

ModelFaucet `1.3.0-beta.1` is a construction candidate, not a published deployment release. Source tags remain the authoritative release boundary, and container image publishing is automated for release tags.

## Source Publishing

The source release is the authoritative artifact for `1.x`:

- Git tag: `v1.3.0`
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

Container registry:

- `ghcr.io/hiclawbot/modelfaucet-api`
- `ghcr.io/hiclawbot/modelfaucet-gateway`
- `ghcr.io/hiclawbot/modelfaucet-dashboard`

The workflow `.github/workflows/container-images.yml` builds all three service
images on pull requests and pushes images to GHCR only for `v*.*.*` tag builds.
Tagged builds publish provenance, verify the registry digest, rerun the image
smoke by digest, and retain one exact digest-reference artifact per service.

Discovery tags:

- `v1.3.0`
- commit SHA tags for traceability
- `latest` only after release validation.

Hosted deployments use the emitted `name@sha256` references, never these tags.

Run `pnpm container:verify` before tagging. Container publishing must keep
provider API keys, Redis URLs, developer tokens, and developer admin tokens in
server-side deployment configuration only.

## Hosted Deployment Publishing

Hosted deployments should be promoted separately from source tags. A source release can be GA while a particular hosted environment remains blocked on cloud-specific checks, real provider smoke, Stripe webhook delivery, backup verification, or registry setup.
