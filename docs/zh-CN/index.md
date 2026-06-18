# ModelFaucet 中文概览

**ModelFaucet（模型水龙头）让每一款软件都成为 AI 的最后一公里渠道。**

ModelFaucet 是一个开源 LLM 分发网关和可嵌入 SDK。它让网站、应用、插件、桌面软件或垂直 SaaS 能够以原生体验集成 AI 功能，同时自动记录 token 用量，并把收入分成归因到软件开发者或分发渠道。

当前状态：`1.0.1` source GA hardening patch，包含 Control API、Gateway、SDK、React package、Local Bridge、数据库 schema、hosted deployment checks、Compose validation 和生产运维预期的稳定公共契约。

## 它包含什么

```txt
1. 可嵌入 AI SDK        在任意应用内添加 AI 功能。
2. LLM Gateway          通过统一 API 路由到云端模型提供商。
3. BYOK                 允许终端用户使用自己的 API key。
4. Local Bridge         支持 Ollama、vLLM、LM Studio 和局域网模型。
5. Usage Ledger         记录 token 用量、成本、价格和毛利。
6. Revenue Sharing      自动给渠道/开发者钱包记账。
```

## 快速开始

```bash
cp .env.example .env
docker compose up -d postgres redis litellm
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

如果要使用平台云端路由，请在 `.env` 中配置服务端 provider key，例如：

```bash
OPENAI_API_KEY=<your-test-key>
```

不要提交 `.env`。真实 provider key 只能存在服务端。没有 provider key 时，可以使用 BYOK 或 Local Bridge。

## 安全边界

- 不把真实 provider keys 放进客户端。
- BYOK mode 不做隐藏收费。
- 云端服务不访问用户私有网络。

完整中文 README 见 [README.zh-CN.md](https://github.com/HiClawBot/modelfaucet/blob/main/README.zh-CN.md)。

本地全链路验证见 [本地 Smoke Test](./local-smoke.md)。

Billing 和 settlement 操作见 [Billing 和 Settlement](./billing-settlement.md)。

安全不变量和 abuse model 见 [Threat 和 Abuse Model](./threat-abuse-model.md)。

托管 beta 部署契约见 [Hosted Beta](./hosted-beta.md)。

`1.x` GA 契约见 [稳定性政策](./stability-policy.md)、[迁移和升级](./migration-upgrade.md)、[生产参考架构](./production-architecture.md)、[部署验证](./deployment-validation.md)、[治理和支持](./governance-support.md) 和 [发布策略](./publishing-strategy.md)。

后续版本规划见 [版本路线图](./roadmap.md)。
