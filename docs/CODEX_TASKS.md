# Codex Task List for ModelFaucet MVP

This file is written as a direct implementation guide for Codex or another coding agent.

Global rules:

```txt
- Work in small commits.
- Add tests for every feature.
- Do not put provider API keys in client-side code.
- Do not log raw secrets.
- Do not make cloud services call localhost or private LAN URLs.
- Use TypeScript strict mode.
- Prefer boring, maintainable code over clever abstractions.
```

---

## Prompt 0 - Bootstrap the repository

Implement the monorepo skeleton.

Create:

```txt
package.json
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
.env.example
docker-compose.yml
apps/api
apps/gateway
apps/dashboard
packages/shared
packages/sdk-js
packages/react
services/rating-worker
services/settlement-worker
services/local-bridge
infra/db
infra/docker
examples/crm-demo
```

Acceptance criteria:

```txt
pnpm install works
pnpm lint works
pnpm typecheck works
pnpm test works, even if no-op tests initially
```

---

## Prompt 1 - Add database schema and seed

Implement `infra/db/schema.sql` and `infra/db/seed.sql`.

Tables:

```txt
developers
apps
app_features
end_users
provider_credentials
virtual_sessions
usage_events
wallets
ledger_entries
payouts
audit_logs
```

Seed:

```txt
Demo Developer
CRM Demo app
public_app_id = app_pub_demo
customer_reply feature
end user test wallet = 10 USD
```

Acceptance criteria:

```txt
docker compose up -d postgres
psql can apply schema.sql
psql can apply seed.sql
all tables exist
seed rows exist
```

---

## Prompt 2 - Build shared types and schemas

Implement `packages/shared`.

Files:

```txt
src/types.ts
src/schemas.ts
src/errors.ts
src/pricing.ts
```

Use Zod schemas for:

```txt
CreateSessionRequest
CreateSessionResponse
ChatCompletionRequest
AddProviderKeyRequest
UsageEvent
RatedUsage
RevenueRule
```

Acceptance criteria:

```txt
pnpm --filter @modelfaucet/shared test
all schema tests pass
```

---

## Prompt 3 - Build Control API health and session endpoint

Implement `apps/api` with Fastify.

Endpoints:

```txt
GET /health
POST /v1/sessions
```

Behavior:

```txt
POST /v1/sessions accepts public_app_id and external_user_id
hash external_user_id
upsert end_user
create virtual_sessions row with hashed token
return mf_sess_xxx token
```

Acceptance criteria:

```txt
curl GET /health returns ok
curl POST /v1/sessions returns session_token
virtual_sessions row exists with token_hash, not raw token
end_users row stores hash, not raw external_user_id
```

---

## Prompt 4 - Build Gateway mock route

Implement `apps/gateway` with Fastify.

Endpoint:

```txt
POST /v1/chat/completions
```

Initial behavior:

```txt
validate session token by calling database or API service
return a mock OpenAI-compatible response
write a mock usage_event
call rating engine
write ledger entries
```

Acceptance criteria:

```txt
valid session can call gateway
expired or invalid session is rejected
mock response matches OpenAI-like shape
usage_events has one row
ledger_entries has debit/credit rows
```

---

## Prompt 5 - Implement Rating Engine

Implement `services/rating-worker/src/rateUsage.ts`.

Cases:

```txt
platform
developer_key
byok
local
```

Acceptance criteria:

```txt
unit tests for platform markup and channel share
unit tests for BYOK no upstream platform cost
unit tests for local no upstream platform cost
negative tokens rejected
unknown route rejected
```

---

## Prompt 6 - Implement Ledger Service

Implement transactional ledger logic.

Function:

```ts
recordRatedUsage(ratedUsage): Promise<void>
```

Requirements:

```txt
Use database transaction.
request_id idempotency.
Use decimal math.
Never physically delete ledger entries.
```

Acceptance criteria:

```txt
same request_id twice does not double charge
wallet balances update correctly
rollback on failure
```

---

## Prompt 7 - Integrate LiteLLM Proxy

Update gateway route to call LiteLLM.

Config:

```txt
LITELLM_BASE_URL=http://localhost:4000
LITELLM_MASTER_KEY=sk-litellm-dev-master-key
```

Behavior:

```txt
For model auto:customer_reply, route to LiteLLM model auto-text.
Proxy request and response.
Capture usage from provider response if present.
Fallback to tokenizer estimate if usage missing.
```

Acceptance criteria:

```txt
with LiteLLM running and provider key configured, real LLM response returns
usage_events captures token counts
ledger_entries captures rated usage
```

---

## Prompt 8 - Build SDK JS

Implement `packages/sdk-js`.

API:

```ts
const faucet = createFaucet({ publicAppId, user, baseUrl, gatewayBaseUrl });
await faucet.createSession();
await faucet.chat({ feature, input });
```

Acceptance criteria:

```txt
SDK can create session
SDK can call gateway
SDK refreshes session when expired
SDK does not accept or expose provider API keys in default mode
```

---

## Prompt 9 - Build React components

Implement:

```txt
FaucetProvider
FaucetChat
```

Phase 1 only.

Acceptance criteria:

```txt
CRM demo can render FaucetChat
User can send prompt
Response appears
Errors are displayed
```

---

## Prompt 10 - Build CRM demo

Create `examples/crm-demo`.

UI:

```txt
textarea with customer ticket
button: Generate Reply
reply output
usage metadata display
```

Acceptance criteria:

```txt
pnpm --filter crm-demo dev works
Demo calls SDK
Usage appears in dashboard or API response
```

---

## Prompt 11 - Build Dashboard MVP

Implement pages:

```txt
/dashboard
/apps/app_pub_demo/usage
/revenue
```

Acceptance criteria:

```txt
Dashboard shows total calls
total input/output tokens
total retail price
total developer revenue
usage table lists request_id and feature_key
```

---

## Prompt 12 - BYOK storage

Implement endpoints:

```txt
POST /v1/user/provider-keys
GET /v1/user/provider-keys
DELETE /v1/user/provider-keys/:id
```

Requirements:

```txt
encrypt key
mask key
never return raw key
audit log
basic provider validation
```

Acceptance criteria:

```txt
raw key is not in API response
raw key is not in logs
list shows masked key
delete disables key
```

---

## Prompt 13 - BYOK routing

Gateway route selection should support BYOK.

Behavior:

```txt
If user has active BYOK and feature/user policy says byok_first, use BYOK route.
Do not apply hidden token markup.
Record route_mode = byok.
Set upstream_cost_usd = 0 for ModelFaucet.
```

Acceptance criteria:

```txt
BYOK route works
usage_events.route_mode = byok
platform upstream cost is zero
```

---

## Prompt 14 - Local Bridge

Implement Go service:

```txt
modelfaucet-bridge start --port 8787
GET /health
GET /models
POST /v1/chat/completions
POST /usage/report
```

Acceptance criteria:

```txt
Bridge starts on 127.0.0.1:8787
Bridge can proxy to Ollama OpenAI-compatible endpoint
Bridge can report usage metadata
Cloud API never fetches local/LAN endpoint directly
```

---

## Prompt 15 - SDK local detection

Add SDK local support:

```ts
await faucet.local.detectBridge();
await faucet.local.listModels();
await faucet.chat({ routeMode: "local", ... });
```

Acceptance criteria:

```txt
SDK detects bridge
SDK can call local bridge
usage route_mode = local
```

---

## Prompt 16 - Developer provider keys

Add developer key management in dashboard/API.

Endpoints:

```txt
POST /v1/developer/provider-keys
GET /v1/developer/provider-keys
DELETE /v1/developer/provider-keys/:id
```

Acceptance criteria:

```txt
Developer can add OpenRouter/OpenAI key
Gateway can route developer_key before platform_pool
Budget limits are enforced
```

---

## Prompt 17 - Credits and payment mock

Implement internal credits without Stripe first.

Endpoints:

```txt
POST /v1/admin/wallets/:id/credit-test-balance
GET /v1/user/wallet
```

Acceptance criteria:

```txt
User with $0 balance cannot use platform route
Admin can credit balance
User can use platform route after credit
```

---

## Prompt 18 - Stripe test mode

Add Stripe test mode top-up.

Flow:

```txt
create checkout session
webhook confirms payment
credit end_user_wallet
```

Acceptance criteria:

```txt
Stripe test card adds credits
wallet balance updates once
webhook idempotency works
```

---

## Prompt 19 - Payout mock

Implement payout simulation.

Behavior:

```txt
Developer wallet accumulates revenue.
If balance >= threshold, create payout pending.
Admin marks payout paid in dev mode.
```

Acceptance criteria:

```txt
Developer revenue becomes pending payout
Paid payout reduces available balance
Audit log created
```

---

## Prompt 20 - Documentation and launch prep

Add:

```txt
CONTRIBUTING.md
SECURITY.md
LICENSE
CHANGELOG.md
.github/workflows/ci.yml
```

Acceptance criteria:

```txt
Fresh clone can run README quickstart
CI passes
No provider keys in repo
No raw secrets in docs examples except placeholders
```
