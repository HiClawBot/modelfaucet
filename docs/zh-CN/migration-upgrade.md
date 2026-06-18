# 迁移和升级指南

本文覆盖 ModelFaucet `1.x` 的源码升级路径。

## 从 `0.9.0` 升级到 `1.0.0`

`1.0.0` 主要是 GA contract release。它不要求超出现有 `infra/db/schema.sql` 的 schema 变更，但运营者仍应先在 staging 数据库运行标准迁移和验证流程，再发布到生产。

```bash
pnpm install --frozen-lockfile
pnpm verify:secrets
pnpm ga:verify
pnpm db:migrate
pnpm hosted:check-isolation
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:build
```

托管环境还需要运行：

```bash
pnpm hosted:verify-env
pnpm hosted:smoke-readiness
```

真实 provider traffic 前设置 `REQUIRE_HOSTED_PROVIDER=1`；托管 Stripe top-up 前设置 `REQUIRE_HOSTED_STRIPE=1`。

## 必需 operator review

- 确认 `API_CORS_ORIGINS` 和 `GATEWAY_CORS_ORIGINS` 是显式 origin。
- 确认 provider key 只存在于服务端 env 或 secret manager。
- 确认 Dashboard bundle 没有使用 developer token 或 developer admin token 构建。
- 确认目标环境的 database backup 和 restore 已测试。
- 确认 incident contacts 仍然有效。

## Rollback

如果 `1.0.0` rollout 在数据库写入前失败，把 application containers 回滚到上一个 image 或 commit。

如果已经发生数据库写入：

- 停止 API 和 Gateway traffic。
- 保留 logs、request IDs、audit logs、usage events、ledger entries 和 provider attempt metadata。
- 比较 rollback 前后的 wallet reconciliation。
- 只有数据完整性受影响时，才从最近一次已测试备份恢复。
- 怀疑泄露时轮换 provider keys、admin tokens、LiteLLM master key 或 encryption keys。

## Fresh Install

全新源码安装时，先按 quickstart 操作，然后运行：

```bash
pnpm smoke:local
pnpm hosted:check-isolation
```

本地 smoke path 使用 mock provider，不需要真实 provider key。
