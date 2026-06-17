# Quickstart

The local stack uses PostgreSQL, Redis, and LiteLLM through Docker Compose.

```bash
cp .env.example .env
docker compose up -d postgres redis litellm
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Run the CRM demo in another shell:

```bash
pnpm --filter crm-demo dev
```

For platform cloud routing, put a real test provider key in `.env` before using LiteLLM:

```bash
OPENAI_API_KEY=<your-test-key>
```

Do not commit `.env`. Provider API keys must stay server-side. Without a provider key, use BYOK or the Local Bridge for end-to-end model calls.

## SDK example

```ts
import { createFaucet } from "@modelfaucet/sdk";

const faucet = createFaucet({
  publicAppId: "app_pub_demo",
  user: { id: "demo-user-1" }
});

const result = await faucet.chat({
  feature: "customer_reply",
  input: {
    ticket_text: "Customer says shipping was too slow and asks for a refund."
  }
});
```

## Expected behavior

- The SDK creates a short-lived session token.
- The Gateway routes to the platform provider pool, BYOK credential, developer key, or Local Bridge according to policy.
- The response streams back to the app.
- `usage_events` receives a row.
- `ledger_entries` records user debit, provider cost, developer revenue, and platform revenue.
- The developer dashboard shows usage and revenue.

## Documentation site

Use these commands while editing docs:

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```
