# 版本路线图

这份路线图从当前源码 MVP 出发，把 ModelFaucet 逐步推进到可生产运行的开源平台。版本号是规划目标，不是承诺日期。每个版本都必须保持三条安全边界：

- Provider API key 只能保存在服务端。
- BYOK 必须是用户可见、可理解的显式控制，不能有隐藏 markup。
- 云端服务绝不访问 localhost、loopback、link-local 或私有局域网 URL。

## 当前基线

ModelFaucet `0.1.0` 已达到源码 MVP 状态。当前包含 Control API、Gateway、Dashboard、SDK、React package、CRM demo、Local Bridge、wallet credits、Stripe 测试模式充值、payout mock、双语 README、文档站、CI，以及依赖大版本兼容升级。

当前生产发布阻塞项：

- 需要在有 Docker 的机器上跑完整 Docker smoke test。
- 需要使用服务端测试 provider key 验证真实 LiteLLM 路由。
- 需要验证 Stripe Checkout 和 webhook 投递。
- 生产密钥需要接入 KMS、Vault 或云 secret manager。
- 需要按部署目标补齐数据库备份、恢复、保留和迁移流程。
- Rate limit、abuse control 和 payout policy 需要生产级审查。

## 版本节奏

| 版本 | 主题 | 主要结果 |
| --- | --- | --- |
| `0.1.x` | 稳定性和文档 | 保持 MVP 可安装、文档准确、依赖当前。 |
| `0.2.0` | 本地生产 smoke | Docker 栈、迁移、seed 和 demo 全链路可跑通。 |
| `0.3.0` | Provider routing beta | 真实 provider 经 LiteLLM 路由可观测、可恢复。 |
| `0.4.0` | Developer console beta | 开发者可在 Dashboard 完成 app、feature、key、wallet、usage、revenue 操作。 |
| `0.5.0` | SDK 和 Local Bridge beta | Web SDK、React package 和本地模型工作流进入产品化形态。 |
| `0.6.0` | 运维和可观测性 | 运营者能定位、限流、恢复和审计系统。 |
| `0.7.0` | Billing 和 settlement beta | Credits、Stripe 充值、ledger reconciliation、payout review 可审计。 |
| `0.8.0` | 安全加固 | Threat model、abuse control、secret handling、private-network 防护完成加固。 |
| `0.9.0` | Hosted beta | 可安全接入真实 pilot developers 的托管环境。 |
| `1.0.0` | GA | API 稳定、迁移策略、支持路径和生产运维手册齐备。 |

## `0.1.x` 稳定性轨道

目标：在开发大功能期间保持当前源码发布健康。

范围：

- 处理依赖和 workflow patch 更新。
- 保持 README、文档站和 release checklist 准确。
- 每个 bug fix 都补回归测试。
- 完善 issue templates、labels 和贡献者指南。
- 只在 CI 和 docs deploy 绿色后发布签名 tag。

验收标准：

- 本地和 CI 都通过 `pnpm verify:secrets`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、app builds 和 docs build。
- 每次 patch 发布前审查 `pnpm outdated -r`。
- 没有开放的高严重级安全或数据完整性问题。

## `0.2.0` 本地生产 Smoke

目标：让新贡献者或 pilot 用户能用 Docker 跑完整系统。

状态：源码已实现。非 Docker 本地 smoke 由 `pnpm smoke:local` 覆盖；Docker Compose 配置在 CI 中校验，可在具备 Docker 的机器上运行。

范围：

- 验证 PostgreSQL、Redis、LiteLLM、API、Gateway、Dashboard 和 CRM demo 的 `docker compose up`。
- 增加一条 smoke-test 命令，覆盖 migrate、seed、session 创建、gateway 调用、usage row、ledger entries 和 dashboard aggregate。
- 用安全 placeholder 文档化 `.env` 配置。
- 增加数据库 reset 和 demo fixture 命令。
- 文档化缺少 provider key、wallet 余额为空、LiteLLM 不可用等失败路径。

验收标准：

- macOS 和 Linux 上，fresh checkout 到可用 demo 小于 15 分钟。
- Docker smoke test 通过，且不暴露 raw provider key。
- Platform route、BYOK route、local route 都有可复现 smoke path。

## `0.3.0` Provider Routing Beta

目标：让云端模型路由能承载真实测试流量。

状态：源码已实现。Provider request 已支持 timeout/retry、脱敏 attempt metadata、provider health check、usage reconciliation、显式 streaming guard，以及只使用服务端 secret 的真实 provider smoke。

范围：

- 使用至少一个服务端测试 provider key 验证 LiteLLM。
- 增加 provider health check、timeout、retry 和结构化 provider error。
- 在 provider adapter 支持时增加 streaming response。
- 增加 fallback order 和 per-feature route policy 控制。
- provider usage 缺失或不一致时做 token usage reconciliation。

验收标准：

- 真实 provider smoke test 通过，provider key 只存在服务端环境或 secret manager。
- 生产环境 Gateway 不访问私有网络 provider URL。
- Provider failure 产生可行动、无 secret 的日志和 client-safe error response。

## `0.4.0` Developer Console Beta

目标：把 Dashboard 从 MVP viewer 变成可用的开发者控制台。

状态：源码已实现。Dashboard 现在包含 Apps、Features、Operations、Usage、
Revenue 和 Provider Keys 页面，并由 developer admin token 保护的
developer-console API 支撑。

范围：

- App 和 feature CRUD，加上校验。
- Feature 级 route policy、markup、revenue share 和 budget 控制。
- Provider key 管理 UX，明确区分 BYOK 和 developer-key。
- Wallet、top-up、usage、revenue 和 payout review 页面。
- 敏感操作 audit log viewer。

验收标准：

- Pilot developer 不编辑 seed SQL 也能完成 app onboarding。
- 敏感表单提交后清空 raw key input，且永不渲染已存储 secret。
- Dashboard route 具备关键状态和错误处理的组件测试。

## `0.5.0` SDK 和 Local Bridge Beta

目标：让真实应用开发者接入体验足够顺畅。

状态：源码已实现。SDK 现在包含 command-style feature call、本地诊断和离线本地 usage-report 缓冲；React 包包含 command 和 usage display 组件；Local Bridge 暴露 diagnostics，同时默认仍只绑定 loopback。

范围：

- 稳定 `@modelfaucet/sdk` public types 和 package exports。
- 增加 chat、command-style feature call、usage display 的 React 组件变体。
- 增加浏览器插件和桌面应用集成示例。
- 改进 Local Bridge 安装、配置、日志和健康诊断。
- 云端上报临时不可用时，本地 usage report 可缓冲。

验收标准：

- SDK 有明确 semver 兼容策略。
- 示例覆盖 platform、BYOK、local mode，且客户端不含 provider key。
- Local Bridge 默认保持 loopback-bound，不静默扩大网络暴露面。

## `0.6.0` 运维和可观测性

目标：让系统在真实流量下可运维。

状态：源码已实现。API 和 Gateway 现在会返回 request ID，暴露 readiness 和 Prometheus-style metrics endpoint，并包含可配置的内存 rate limit；同时补充 rollback、backup 和 restore runbook。

范围：

- API、Gateway、workers 全链路结构化日志和 request ID。
- latency、token usage、route mode、provider error、wallet failure、ledger write 指标。
- 按 app、feature、wallet、developer key、session、IP 等维度限流。
- Admin health 和 readiness endpoints。
- Migration rollback、backup/restore runbooks。

验收标准：

- 一次失败请求能从 SDK 调用追踪到 provider response 或 ledger rejection。
- 运营者能区分 provider failure、wallet failure、validation failure 和 abuse throttling。
- backup/restore 流程在非生产数据库上验证通过。

## `0.7.0` Billing 和 Settlement Beta

目标：在任何真实 payout 前让资金流可审计。

范围：

- Stripe Checkout 和 webhook delivery 在 test mode 验证。
- 增加 wallet balances 和 usage events 的 ledger reconciliation job。
- 增加带人工审批关口的 payout review workflow。
- 建立 refund、adjustment、chargeback accounting model。
- 导出 usage、revenue、payout period 的 CSV 报表。

验收标准：

- Stripe test card 充值和 webhook replay 端到端验证通过。
- Ledger balance reconstruction 与 wallet balance 匹配。
- 没有显式 operator approval 时，不能触发真实付款。

## `0.8.0` 安全加固

目标：Hosted beta 前降低关键风险。

范围：

- 更新 threat model 和 abuse model。
- 所有 provider URL 路径补齐 SSRF/private-network guard 回归测试。
- 增加 log、API response、dashboard rendering 的 secret redaction 测试。
- 审查 CORS、auth、token expiry、request body limit 和 admin-token handling。
- Release workflow 增加 dependency、container、secret scanning。

验收标准：

- 没有已知路径允许云端访问 localhost 或私有 LAN 目标。
- Provider key 只通过显式 server endpoint 接收，且不会出现在 client bundle。
- Hosted pilot 前安全 release checklist 全部通过。

## `0.9.0` Hosted Beta

目标：安全接入少量真实 pilot developers。

范围：

- 将 API、Gateway、Dashboard、workers、PostgreSQL、Redis 和 LiteLLM 部署到托管环境。
- 所有敏感值使用真实 secret manager。
- 增加 tenant 和 app isolation 检查。
- 增加运营告警和 incident-response 联系方式。
- 发布 hosted beta 文档和 acceptable-use policy。

验收标准：

- Pilot apps 可以在有成本和用量监控的前提下跑真实流量。
- Support、abuse、security 联系方式公开。
- Hosted beta 有 rollback、restore 和 emergency key-rotation 流程。

## `1.0.0` GA

目标：声明稳定公共契约和生产运维预期。

范围：

- 冻结稳定 API 和 SDK surface，并给出 deprecation policy。
- 发布 migration 和 upgrade guides。
- 发布生产部署参考架构。
- 明确治理、maintainership、support policy 和 release cadence。
- 决定 package publishing 和 container image publishing 策略。

验收标准：

- 源码、packages、containers 和 hosted deployment 的 release checklist 都通过。
- API、SDK、database migration 和 security policies 文档齐备。
- 生产事故可以通过日志、指标、runbooks 和 rollback path 处理。

## 每个版本的固定规则

- Tag 前运行 secret scan、lint、typecheck、tests、docs build 和相关 app builds。
- 每个 bug fix 和安全规则都要有测试。
- Provider API key 不进入客户端代码、文档示例或隐藏 markup。
- BYOK 的价格和路由行为必须对用户明确。
- Private-network URL guard 保持集中实现，并有回归测试覆盖。
- Scope 变化时同步更新 changelog、release checklist 和 roadmap。
