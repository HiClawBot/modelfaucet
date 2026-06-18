# 治理和支持

本文定义 ModelFaucet `1.x` 的 source GA 运营预期。

## Maintainership

Maintainers 负责审查 security-sensitive changes、release tags、dependency updates，以及会改变生产预期的文档。

Security-sensitive areas 包括：

- Provider key handling。
- BYOK user experience 和 pricing disclosure。
- Private-network URL guard behavior。
- Wallet、ledger、payout 和 Stripe flows。
- Admin 和 developer-console authorization。

## Support Policy

Source GA 支持通过 GitHub issues、启用时的 GitHub Discussions，以及文档化 contact paths 提供。Hosted deployments 必须发布自己的 support、abuse、security 和 incident contacts。

支持的源码线：

- 最新 `1.x` minor release 接收 bug fixes 和 security fixes。
- 旧 `1.x` minor 在无法 backport 时提供 best-effort security notes。
- `1.0.0` 后不再支持 `0.x` prereleases，除升级指导外。

## Release Cadence

建议 cadence：

- Patch releases 用于 security fixes 和 regressions。
- Minor releases 用于 backwards-compatible features。
- Major releases 用于 breaking public contract changes。

每个 release 必须通过 release checklist，并更新 `CHANGELOG.md`。

## Decision Process

Breaking API、SDK、database、security 或 pricing behavior changes 需要先有文档化 proposal。Emergency security changes 可以绕过常规 cadence，但必须发布 follow-up notes。

## Security Intake

按 `SECURITY.md` 报告漏洞。不要在 public issues 中包含 live provider keys、Stripe secrets、admin tokens 或 customer data。
