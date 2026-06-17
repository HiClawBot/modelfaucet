# ModelFaucet Project Brief

ModelFaucet（模型水龙头）是一套开源 LLM 分销网关与嵌入式 SDK。它的目标是让任意软件成为 AI-LLMs to end users 的最后一公里分销渠道。

## MVP success loop

```txt
Third-party app embeds SDK
-> end user uses AI without provider API key
-> gateway routes request to cloud LLM
-> usage ledger records token usage and cost
-> rating engine calculates retail price and margin
-> developer wallet receives channel revenue
```

## Build priority

1. Session Broker
2. OpenAI-compatible Gateway
3. LiteLLM integration
4. Usage Ledger
5. Rating Engine
6. SDK + CRM demo
7. Developer dashboard
8. BYOK
9. Local Bridge
10. Stripe credits and payout

## Hard rules

```txt
- Never ship real provider keys to clients.
- Never hide token markup in BYOK mode.
- Never let the cloud gateway access user private network endpoints.
```

## Start implementation

Give Codex this instruction:

> Implement ModelFaucet according to docs/CONSTRUCTION.md and docs/CODEX_TASKS.md. Start with Prompt 0. After each prompt, run lint, typecheck, and tests. Keep all provider keys server-side only.
