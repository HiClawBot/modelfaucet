# Local Smoke Test

Use this guide to verify the `0.2.0` local stack without real provider keys. The smoke path uses a local OpenAI-compatible mock provider, so no cloud provider secret is required.

## Prerequisites

- Node.js 22
- pnpm 9
- PostgreSQL client tools with `psql`
- A reachable PostgreSQL database
- Docker, only if you want to run the Compose stack

## Non-Docker Smoke

Start with a clean environment file and a local database:

```bash
cp .env.example .env
export DATABASE_URL=postgresql://modelfaucet:modelfaucet@localhost:5432/modelfaucet
export SECRET_ENCRYPTION_KEY=dev_32_bytes_replace_me_replace_me
export LITELLM_MASTER_KEY=sk-test-litellm-master-key
```

Reset and seed the development database:

```bash
pnpm db:reset:dev
```

Run the local smoke test:

```bash
pnpm smoke:local
```

The smoke test:

- Applies the schema and seed data.
- Starts the Control API on `127.0.0.1:3101`.
- Starts the Gateway on `127.0.0.1:3102`.
- Starts a local mock provider on `127.0.0.1:4100`.
- Creates a short-lived session for `app_pub_demo`.
- Calls `/v1/chat/completions`.
- Verifies a `usage_events` row.
- Verifies ledger entries for the request.
- Verifies the dashboard usage aggregate includes the request.
- Verifies ledger reconciliation has zero mismatches.

The script does not print session tokens or provider secrets.

## Docker Compose Stack

The Compose file includes PostgreSQL, Redis, LiteLLM, a mock OpenAI-compatible provider, API, Gateway, Dashboard, and CRM demo. Its default LiteLLM config forwards `auto-text` to the local mock provider, so it can boot without real provider keys.

```bash
cp .env.example .env
docker compose up --build
```

Default URLs:

```txt
API:        http://localhost:3001
Gateway:    http://localhost:3002/v1
Dashboard:  http://localhost:5173
CRM demo:   http://localhost:5174
Mock model: http://localhost:4010
LiteLLM:    http://localhost:4000
```

By default, the Gateway points to LiteLLM through `LITELLM_BASE_URL=http://litellm:4000`, and LiteLLM forwards to the local mock provider. Real provider routing belongs to the `0.3.0` provider-routing beta and must use server-side secrets only.

## Route Smoke Paths

Platform mode:

- Default local smoke uses the mock provider as the platform provider route.
- Real provider mode belongs to the `0.3.0` provider-routing beta and requires server-side secrets only.

BYOK mode:

- BYOK keys are submitted only through explicit server API endpoints.
- API responses return masked key summaries only.
- Cloud provider base URLs must be public internet URLs, not localhost or private LAN targets.

Local mode:

- Local mode uses the user-local bridge on loopback, normally `127.0.0.1:8787`.
- The cloud API and Gateway do not fetch user localhost or private LAN URLs.

## Failure Modes

Missing provider keys:

- Use the mock provider for `0.2.0` smoke tests.
- Real provider tests should fail closed with a provider error until server-side secrets are configured.

Empty wallet balance:

- Platform and developer-key routes should return `insufficient_balance`.
- Use `pnpm db:reset:dev` to restore the seeded demo wallet.

Unavailable provider route:

- Gateway should return a client-safe provider error.
- Logs must not include raw provider keys.
