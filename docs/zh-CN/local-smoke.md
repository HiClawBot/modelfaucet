# 本地 Smoke Test

这份指南用于验证 `0.2.0` 本地栈。默认 smoke path 使用本地 OpenAI-compatible mock provider，不需要真实 provider key。

## 前置条件

- Node.js 22
- pnpm 9
- 带 `psql` 的 PostgreSQL client tools
- 一个可访问的 PostgreSQL database
- Docker，仅在需要运行 Compose 栈时使用

## 非 Docker Smoke

先准备本地环境和数据库：

```bash
cp .env.example .env
export DATABASE_URL=postgresql://modelfaucet:modelfaucet@localhost:5432/modelfaucet
export SECRET_ENCRYPTION_KEY=dev_32_bytes_replace_me_replace_me
export LITELLM_MASTER_KEY=sk-test-litellm-master-key
```

重置并 seed 开发数据库：

```bash
pnpm db:reset:dev
```

运行 smoke test：

```bash
pnpm smoke:local
```

这个 smoke test 会：

- 应用 schema 和 seed data。
- 在 `127.0.0.1:3101` 启动 Control API。
- 在 `127.0.0.1:3102` 启动 Gateway。
- 在 `127.0.0.1:4100` 启动本地 mock provider。
- 为 `app_pub_demo` 创建短期 session。
- 调用 `/v1/chat/completions`。
- 验证 `usage_events` 写入。
- 验证该请求对应的 ledger entries。
- 验证 dashboard usage aggregate 包含该请求。
- 验证 ledger reconciliation 没有 mismatch。

脚本不会打印 session token 或 provider secret。

## Docker Compose 栈

Compose 文件包含 PostgreSQL、Redis、LiteLLM、本地 mock provider、API、Gateway、Dashboard 和 CRM demo。默认 LiteLLM 配置会把 `auto-text` 转发到本地 mock provider，所以不需要真实 provider key 也能启动。

```bash
cp .env.example .env
docker compose up --build
```

默认 URL：

```txt
API:        http://localhost:3001
Gateway:    http://localhost:3002/v1
Dashboard:  http://localhost:5173
CRM demo:   http://localhost:5174
Mock model: http://localhost:4010
LiteLLM:    http://localhost:4000
```

默认情况下，Gateway 通过 `LITELLM_BASE_URL=http://litellm:4000` 指向 LiteLLM，LiteLLM 再转发到本地 mock provider。真实 provider routing 属于 `0.3.0` provider-routing beta，只能使用服务端 secret。

## 路由 Smoke Path

Platform mode:

- `0.2.0` 默认用 mock provider 验证 platform route。
- 真实 provider route 属于 `0.3.0` provider-routing beta，只能使用服务端 secret。

BYOK mode:

- BYOK key 只能通过显式服务端 API endpoint 提交。
- API response 只返回 masked key summary。
- 云端 provider base URL 必须是公网 URL，不能是 localhost 或私有 LAN。

Local mode:

- Local mode 使用用户本机 loopback bridge，通常是 `127.0.0.1:8787`。
- 云端 API 和 Gateway 不会抓取用户 localhost 或私有 LAN URL。

## 失败路径

缺少 provider key:

- `0.2.0` smoke test 使用 mock provider。
- 真实 provider test 在服务端 secret 未配置时应 fail closed，并返回 provider error。

钱包余额为空:

- Platform 和 developer-key route 应返回 `insufficient_balance`。
- 使用 `pnpm db:reset:dev` 可恢复 seeded demo wallet。

Provider route 不可用:

- Gateway 应返回 client-safe provider error。
- 日志不能包含 raw provider key。
