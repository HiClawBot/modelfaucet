# Contributing to ModelFaucet

ModelFaucet is a TypeScript/Go monorepo. Contributions should keep the MVP boring,
testable, and secure by default.

## Local Setup

```bash
cp .env.example .env
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

Use Docker Compose for the optional local PostgreSQL/Redis/LiteLLM stack:

```bash
docker compose up -d postgres redis litellm
pnpm db:migrate
pnpm db:seed
```

## Before Opening A PR

Run these checks from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @modelfaucet/dashboard build
pnpm --filter crm-demo build
```

Add tests for every behavior change. For database-sensitive changes, include a
focused PostgreSQL verification or a clear explanation of what was not exercised.

## Security Rules

- Do not commit provider API keys, Stripe secrets, webhook secrets, session tokens, or raw BYOK/developer keys.
- Do not log raw secrets.
- Do not add cloud-side calls to localhost, loopback, link-local, or private LAN URLs.
- Do not add hidden markup for BYOK mode.
- Keep provider credentials server-side; clients may submit keys only to explicit API key-management endpoints.

## Code Style

- Use strict TypeScript and the existing package boundaries.
- Prefer shared schemas from `@modelfaucet/shared` over ad hoc validation.
- Keep wallet, ledger, payment, and payout changes transactional.
- Do not physically delete ledger, usage, payment, or payout records.
