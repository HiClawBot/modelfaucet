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

Do not commit `.env`. Provider API keys must stay server-side. Without a provider key, the hosted Beta platform route cannot make an end-to-end model call. BYOK and Local Bridge remain out of the first hosted Beta scope; see the capability matrix.

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
- The first hosted Beta routes a non-streaming request to the configured platform provider.
- A normal JSON Chat Completions response returns to the app.
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
