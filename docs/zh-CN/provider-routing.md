# Provider Routing Beta

ModelFaucet `0.3.0` 加固了 Gateway 通过 LiteLLM 和 OpenAI-compatible endpoint 访问云端 provider 的路径。

## 变化

- Provider request 支持可配置 timeout 和 retry。
- Retry attempt 会写入脱敏 metadata，不包含 Authorization header 或 raw key。
- 当 provider 返回的 `prompt_tokens`、`completion_tokens` 或 `total_tokens` 缺失/不一致时，会做 usage reconciliation。
- Gateway 暴露 `/health/providers` 供 operator 检查。
- BYOK 和 developer-key route 只有在 credential 或 feature policy 显式允许时，才能 fallback 到 platform route。
- `stream: true` 会被明确拒绝，直到 streaming ledger accounting 实现。

## 环境变量

```bash
LITELLM_BASE_URL=https://your-litellm.example
LITELLM_MASTER_KEY=<server-side-litellm-key>
PROVIDER_TIMEOUT_MS=30000
PROVIDER_MAX_RETRIES=1
PROVIDER_RETRY_DELAY_MS=250
```

Provider key 只能保存在服务端环境变量、secret manager 或加密 credential storage 中。不能通过 SDK options、React props、浏览器 markup 或 dashboard hidden inputs 传递。

## Health Check

```bash
curl http://localhost:3002/health/providers
```

示例：

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

## 真实 Provider Smoke

只有在已经配置真实 LiteLLM route 时才运行 `pnpm smoke:provider`。这个命令会启动本地 Control API 和 Gateway，但会使用服务端 `LITELLM_BASE_URL`，而不是本地 mock provider。

```bash
export DATABASE_URL=postgresql://modelfaucet:modelfaucet@localhost:5432/modelfaucet
export SECRET_ENCRYPTION_KEY=dev_32_bytes_replace_me_replace_me
export LITELLM_BASE_URL=https://your-litellm.example
export LITELLM_MASTER_KEY=<server-side-litellm-key>
pnpm smoke:provider
```

如果 `LITELLM_BASE_URL` 是 localhost 或私有网络地址，命令会拒绝运行。只有一次性本地测试可以设置 `SMOKE_ALLOW_PRIVATE_PROVIDER=1`。

## Fallback 规则

只有以下条件之一成立时，才允许 fallback 到 platform route：

- 选中的 BYOK 或 developer credential 设置了 `fallback_to_platform=true`。
- Feature policy 设置了 `fallback_to_platform=true`。
- Feature policy 把 `provider_fallback` 设置为 `platform` 或 `platform_pool`。

Fallback 只处理 provider failure。它不会绕过 private-network URL 防护、invalid session、expired session、wallet 余额不足或 developer-key budget limit。

## Streaming

当前 `stream: true` 会返回：

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

这是 `0.3.0` 的刻意限制；streaming 需要先实现 partial usage accounting 和 cancellation-safe ledger 行为。

