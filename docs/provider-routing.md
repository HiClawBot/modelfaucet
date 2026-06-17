# Provider Routing Beta

ModelFaucet `0.3.0` hardens the Gateway path used for cloud provider routing through LiteLLM and OpenAI-compatible endpoints.

## What Changed

- Provider requests have configurable timeouts and retries.
- Retry attempts are recorded as sanitized metadata without Authorization headers or raw keys.
- Provider usage is reconciled when `prompt_tokens`, `completion_tokens`, or `total_tokens` are missing or inconsistent.
- The Gateway exposes `/health/providers` for operator checks.
- BYOK and developer-key routes can fall back to platform routing when the stored credential or feature policy explicitly allows it.
- `stream: true` requests are rejected with a clear response until streaming ledger accounting is implemented.

## Environment

```bash
LITELLM_BASE_URL=https://your-litellm.example
LITELLM_MASTER_KEY=<server-side-litellm-key>
PROVIDER_TIMEOUT_MS=30000
PROVIDER_MAX_RETRIES=1
PROVIDER_RETRY_DELAY_MS=250
```

Provider keys must stay in server-side environment variables, a secret manager, or encrypted credential storage. They must not be passed through SDK options, React props, browser markup, or dashboard hidden inputs.

## Health Check

```bash
curl http://localhost:3002/health/providers
```

Example response:

```json
{
  "ok": true,
  "providers": [
    {
      "ok": true,
      "provider": "litellm",
      "statusCode": 200,
      "latencyMs": 12
    }
  ]
}
```

## Real Provider Smoke

Use `pnpm smoke:provider` only when a real LiteLLM route is configured. This command starts the local Control API and Gateway, but it uses your server-side `LITELLM_BASE_URL` instead of the local mock provider.

```bash
export DATABASE_URL=postgresql://modelfaucet:modelfaucet@localhost:5432/modelfaucet
export SECRET_ENCRYPTION_KEY=dev_32_bytes_replace_me_replace_me
export LITELLM_BASE_URL=https://your-litellm.example
export LITELLM_MASTER_KEY=<server-side-litellm-key>
pnpm smoke:provider
```

The command refuses localhost or private-network `LITELLM_BASE_URL` values unless `SMOKE_ALLOW_PRIVATE_PROVIDER=1` is set for a disposable local-only test.

## Fallback Rules

Fallback to platform routing is allowed only when one of these is true:

- The selected BYOK or developer credential has `fallback_to_platform=true`.
- The feature policy sets `fallback_to_platform=true`.
- The feature policy sets `provider_fallback` to `platform` or `platform_pool`.

Fallback is used only for provider failures. It does not bypass private-network URL protections, invalid sessions, expired sessions, insufficient wallet balance, or developer-key budget limits.

## Streaming

`stream: true` currently returns:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Streaming responses are not enabled in this gateway release.",
    "details": {
      "streaming_supported": false
    }
  }
}
```

This is intentional for `0.3.0`; streaming requires first-class partial usage accounting and cancellation-safe ledger behavior.

