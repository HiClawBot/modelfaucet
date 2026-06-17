# Security Policy

ModelFaucet has three hard rules:

```txt
1. No real provider API keys in client-side code.
2. No hidden token markup in BYOK mode.
3. No cloud-side access to user private networks.
```

See `docs/SECURITY.md` for the full security architecture.

Report vulnerabilities privately to the project maintainer before public disclosure.

## Supported Versions

The MVP is pre-1.0. Security fixes are accepted on the default branch until a
versioned release branch policy exists.

## Secret Handling

- Provider API keys, developer keys, BYOK secrets, Stripe secret keys, and webhook secrets are server-side only.
- API responses must return masked secret summaries only.
- Logs and audit records must never contain raw secret values.
- `.env.example` may contain placeholders only.

## Private Network Protection

Cloud services must not fetch localhost, loopback, link-local, or private LAN URLs.
Local model calls belong in the loopback-bound Local Bridge, not in the cloud API or
gateway.

## Reporting

Use private disclosure for vulnerabilities. Include:

- Affected package or service.
- Minimal reproduction steps.
- Impact and expected severity.
- Whether a secret, wallet balance, ledger entry, or private network URL is involved.
