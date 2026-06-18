# Governance And Support

This policy defines source GA operating expectations for ModelFaucet `1.x`.

## Maintainership

Maintainers are responsible for reviewing security-sensitive changes, release tags, dependency updates, and documentation that changes production expectations.

Security-sensitive areas include:

- Provider key handling.
- BYOK user experience and pricing disclosure.
- Private-network URL guard behavior.
- Wallet, ledger, payout, and Stripe flows.
- Admin and developer-console authorization.

## Support Policy

Source GA support is provided through GitHub issues, GitHub Discussions when enabled, and documented contact paths. Hosted deployments must publish their own support, abuse, security, and incident contacts.

Supported source lines:

- Latest `1.x` minor release receives bug fixes and security fixes.
- Older `1.x` minors receive best-effort security notes when a fix cannot be backported.
- `0.x` prereleases are not supported after `1.0.0` except for upgrade guidance.

## Release Cadence

Recommended cadence:

- Patch releases for security fixes and regressions.
- Minor releases for backwards-compatible features.
- Major releases for breaking public contract changes.

Every release must pass the release checklist and update `CHANGELOG.md`.

## Decision Process

Breaking API, SDK, database, security, or pricing behavior changes need a documented proposal before implementation. Emergency security changes can bypass the normal cadence but must publish follow-up notes.

## Security Intake

Report vulnerabilities using `SECURITY.md`. Do not include live provider keys, Stripe secrets, admin tokens, or customer data in public issues.
