# 发布策略

ModelFaucet `1.0.0` 作为 source GA release 发布到 GitHub。Package 和 container publishing 应在 registry ownership 和 automation credentials 配好后按以下策略执行。

## Source Publishing

`1.0.0` 的权威 artifact 是 source release：

- Git tag：`v1.0.0`
- GitHub Release notes 使用英文和简体中文。
- Release commit 上 CI 和 docs workflows 绿色。
- 不提交 generated build artifacts 或 local env files。

## Package Publishing

计划中的 npm packages：

- `@modelfaucet/sdk`
- `@modelfaucet/react`

npm publishing 前：

- 确认 npm namespace ownership。
- 只对需要发布的 package 移除 `private`。
- 确认 package exports、types、README、license 和 semver policy。
- 运行 `pnpm verify:secrets`、`pnpm lint`、`pnpm typecheck` 和 `pnpm test`。

Provider API keys 绝不能作为 client package defaults 出现。

## Container Image Publishing

计划中的 container registry：

- `ghcr.io/hiclawbot/modelfaucet-api`
- `ghcr.io/hiclawbot/modelfaucet-gateway`
- `ghcr.io/hiclawbot/modelfaucet-dashboard`

推荐 tags：

- `1.0.0`
- `1.0`
- `latest` 只在 release validation 后移动。

Container publishing 必须包含 image scanning、可用时的 build provenance，以及针对 disposable database 的 smoke test。

## Hosted Deployment Publishing

Hosted deployments 应和 source tags 分开晋级。源码 release 可以达到 GA，但某个具体 hosted environment 仍可能因为 cloud-specific checks、real provider smoke、Stripe webhook delivery、backup verification 或 registry setup 而阻塞。
