# 稳定性政策

ModelFaucet `1.0.0` 是 source GA 版本。除非安全修复需要更快收窄行为，下面的公共契约在 `1.x` 期间保持稳定。

## 稳定 surface

- `docs/API_SPEC.md` 中记录的 Control API routes。
- `/v1` 下的 OpenAI-compatible Gateway routes。
- `@modelfaucet/sdk` exports。
- `@modelfaucet/react` exports。
- Local Bridge loopback HTTP routes。
- `infra/db/schema.sql` 中的 PostgreSQL schema objects。
- Release checklist 中记录的运维脚本。

## 安全不变量

- Provider API keys stay server-side only。
- No hidden BYOK markup 或隐藏 BYOK 费用。
- Cloud services must not access localhost or private LAN URLs。
- Local model traffic 默认通过 loopback-bound Local Bridge。
- 已存储 provider secrets 只能以 masked summary 返回。

## API 和 SDK 兼容性

稳定 API 和 SDK 字段可以增加可选字段。除非经过 deprecation，`1.x` 期间不应移除已有 required request fields、response field names、route names 和 exported TypeScript names。

Breaking change 需要：

- Changelog entry。
- Migration notes。
- 安全不要求立即移除时，至少保留一个 minor release 的 deprecation period。
- 覆盖替代行为的回归测试。

## 数据库迁移政策

Schema change 必须是 forward-only migration step。破坏性变更需要在 release 中明确 backup、restore 和 rollback note。

`1.x` 期间，migration 应保留已有 app、developer、wallet、usage、ledger、provider credential、payout 和 audit-log 数据，除非 release notes 明确说明。

## 安全补丁政策

安全补丁可以不等常规 release cadence。当安全补丁改变行为时，release 必须说明受影响 surface、operator action，以及是否需要 key rotation 或 data review。
