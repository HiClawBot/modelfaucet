# ModelFaucet API Specification

Version: v0.1 Draft  
Date: 2026-06-17

---

## 1. Conventions

Base URLs:

```txt
Control API:  https://api.modelfaucet.dev
Gateway API:  https://gateway.modelfaucet.dev/v1
Local Bridge: http://127.0.0.1:8787
```

Auth:

```txt
Developer/admin endpoints: Bearer mf_admin_xxx
End-user/session endpoints: Bearer mf_sess_xxx
Gateway endpoints: Bearer mf_sess_xxx
```

Errors:

```json
{
  "error": {
    "code": "insufficient_balance",
    "message": "The end user wallet does not have enough credits.",
    "request_id": "req_xxx"
  }
}
```

Common error codes:

```txt
invalid_request
invalid_session
expired_session
invalid_app
feature_not_found
no_available_route
insufficient_balance
budget_exceeded
rate_limited
provider_error
local_bridge_unavailable
secret_validation_failed
```

---

## 2. Session API

### POST /v1/sessions

Creates a short-lived session token for an app end user.

Request:

```json
{
  "public_app_id": "app_pub_demo",
  "external_user_id": "user_123",
  "feature_key": "customer_reply",
  "metadata": {
    "plan": "free",
    "locale": "zh-CN"
  }
}
```

Response:

```json
{
  "session_token": "mf_sess_abc",
  "expires_in": 3600,
  "gateway_base_url": "https://gateway.modelfaucet.dev/v1",
  "available_modes": ["platform", "byok", "local"],
  "wallet_balance_usd": "10.00000000"
}
```

Rules:

```txt
- external_user_id must be hashed before storage.
- session_token must be stored hashed.
- token TTL defaults to 3600 seconds.
- public_app_id is not a secret.
```

---

## 3. Gateway API

### GET /health/providers

Returns sanitized provider health information for operator checks. It must not
include raw provider keys, Authorization headers, or secret-bearing URLs.

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

### POST /v1/chat/completions

OpenAI-compatible chat completions endpoint.

Headers:

```txt
Authorization: Bearer mf_sess_abc
Content-Type: application/json
```

Request:

```json
{
  "model": "auto:customer_reply",
  "messages": [
    {
      "role": "user",
      "content": "客户说物流太慢，要求退款，帮我回复。"
    }
  ],
  "stream": false,
  "metadata": {
    "feature_key": "customer_reply"
  }
}
```

Response:

```json
{
  "id": "chatcmpl_mf_123",
  "object": "chat.completion",
  "created": 1781635200,
  "model": "auto:customer_reply",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "您好，非常抱歉这次物流延误给您带来不便..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 128,
    "completion_tokens": 96,
    "total_tokens": 224
  },
  "modelfaucet": {
    "request_id": "req_abc",
    "route_mode": "platform",
    "feature_key": "customer_reply",
    "estimated_price_usd": "0.00123400"
  }
}
```

`stream: true` is currently rejected with `invalid_request` until streaming ledger accounting is implemented.

---

## 4. BYOK API

### POST /v1/user/provider-keys

Adds an end-user provider key.

Auth: `mf_sess_xxx`

Request:

```json
{
  "provider": "openai",
  "api_key": "sk-...",
  "base_url": "https://api.openai.com/v1",
  "models_allowed": ["gpt-4.1-mini"],
  "budget_limit_usd": "20.00",
  "priority": 1,
  "fallback_to_platform": false
}
```

Response:

```json
{
  "id": "cred_123",
  "provider": "openai",
  "base_url": "https://api.openai.com/v1",
  "masked": "sk-...abcd",
  "status": "active",
  "models_allowed": ["gpt-4.1-mini"],
  "priority": 1,
  "fallback_to_platform": false
}
```

Rules:

```txt
- Validate the key before storing if provider supports cheap validation.
- Encrypt before persistence.
- Never return raw api_key.
- Log audit event.
```

### GET /v1/user/provider-keys

Response:

```json
{
  "items": [
    {
      "id": "cred_123",
      "provider": "openai",
      "masked": "sk-...abcd",
      "status": "active",
      "priority": 1
    }
  ]
}
```

### DELETE /v1/user/provider-keys/:id

Deletes or disables a key.

Response:

```json
{ "ok": true }
```

---

## 5. Local Endpoint API

### POST /v1/local/endpoints

Registers a local endpoint preference. The cloud API stores metadata only; it must not directly access the LAN URL.

Request:

```json
{
  "name": "ollama-qwen",
  "base_url": "http://localhost:11434/v1",
  "provider": "openai_compatible",
  "models": ["qwen2.5:7b"],
  "mode": "local_bridge"
}
```

Response:

```json
{
  "id": "local_ep_123",
  "name": "ollama-qwen",
  "status": "registered"
}
```

Validation:

```txt
- For cloud API, reject any attempt to fetch private network URLs.
- For Local Bridge, allow localhost and LAN URLs if configured by the user.
```

---

## 6. Local Bridge API

### GET /health

Response:

```json
{
  "ok": true,
  "version": "0.1.0",
  "listening": "127.0.0.1:8787"
}
```

### GET /models

Response:

```json
{
  "items": [
    {
      "id": "ollama:qwen2.5:7b",
      "provider": "ollama",
      "endpoint_id": "ollama",
      "capabilities": ["chat", "json"]
    }
  ]
}
```

### POST /v1/chat/completions

OpenAI-compatible proxy to local model.

Request:

```json
{
  "model": "ollama:qwen2.5:7b",
  "messages": [
    { "role": "user", "content": "总结这段文字。" }
  ]
}
```

Response: OpenAI-compatible.

### POST /usage/report

Bridge reports metadata to cloud ledger.

Request:

```json
{
  "request_id": "req_local_123",
  "app_id": "app_123",
  "end_user_id_hash": "hash_xxx",
  "feature_key": "summarize",
  "route_mode": "local",
  "provider": "ollama",
  "model": "qwen2.5:7b",
  "input_tokens": 1000,
  "output_tokens": 200,
  "created_at": "2026-06-17T00:00:00Z"
}
```

---

## 7. Developer API

### POST /v1/developers

Request:

```json
{
  "name": "Demo Developer",
  "email": "dev@example.com"
}
```

Response:

```json
{
  "id": "dev_123",
  "name": "Demo Developer",
  "email": "dev@example.com"
}
```

### POST /v1/apps

Request:

```json
{
  "developer_id": "dev_123",
  "name": "CRM Demo",
  "vertical": "crm",
  "default_revenue_share_bps": 4000
}
```

Response:

```json
{
  "id": "app_123",
  "public_app_id": "app_pub_demo",
  "developer_id": "dev_123",
  "name": "CRM Demo"
}
```

### POST /v1/apps/:id/features

Request:

```json
{
  "feature_key": "customer_reply",
  "display_name": "客户回复生成",
  "policy": {
    "route_preference": ["local", "end_user_byok", "developer_key", "platform_pool"],
    "privacy": "redact_pii_before_cloud",
    "model_policy": "cheapest_sufficient"
  },
  "pricing": {
    "mode": "usage_markup",
    "markup_percent": 30,
    "channel_share_bps": 4000
  }
}
```

---

## 8. Usage and Revenue API

### GET /v1/apps/:id/usage

Response:

```json
{
  "items": [
    {
      "request_id": "req_abc",
      "feature_key": "customer_reply",
      "route_mode": "platform",
      "provider": "openrouter",
      "model": "auto-text",
      "input_tokens": 128,
      "output_tokens": 96,
      "retail_price_usd": "0.00123400",
      "channel_revenue_usd": "0.00012300",
      "created_at": "2026-06-17T00:00:00Z"
    }
  ]
}
```

### GET /v1/developers/:id/revenue

Response:

```json
{
  "developer_id": "dev_123",
  "wallet_balance_usd": "12.34560000",
  "pending_payout_usd": "10.00000000",
  "lifetime_revenue_usd": "34.56780000"
}
```
