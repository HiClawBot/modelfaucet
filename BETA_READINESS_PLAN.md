# ModelFaucet 真实可用 Beta 施工计划

> 发布证据更新：2026-07-21｜`main` `10483b4`｜已发布 prerelease `v1.3.0-beta.1`

## 施工状态（2026-07-21 收口）

- **W0–W4 已完成并本地验证**：能力边界、production runtime、迁移/bootstrap、并发安全的预留/幂等/结算、usage 权限、origin/spend、Redis 限流和生产功能开关已落地。
- **W5 仓库与镜像发布部分已完成**：依赖型 readiness、metrics auth、backup/restore drill、运营不变量、告警规则/单测、rollback/runbook、三服务 Docker runtime smoke 和不可变 GHCR 镜像已落地；真实 managed staging 演练仍是外部门禁。
- **当前决策：允许进入 managed staging，不允许接真实外部用户。** tag-only registry digest/provenance/pull-run 已完成；真实 managed DB/Redis/TLS/secret manager、provider canary、60 分钟 soak、告警路由、账单抽样、restore/rollback 和 pilot canary 仍须形成外部证据。
- **发布证据**：PR #19 最终提交 `8bead1c` 已通过[三服务 RC Docker CI](https://github.com/HiClawBot/modelfaucet/actions/runs/29836323229)和[全量 CI](https://github.com/HiClawBot/modelfaucet/actions/runs/29836322681)；`v1.3.0-beta.1` 的[标签镜像发布](https://github.com/HiClawBot/modelfaucet/actions/runs/29838866864)与[双语 prerelease](https://github.com/HiClawBot/modelfaucet/releases/tag/v1.3.0-beta.1)也已完成。
- 精确产品范围以 `docs/capability-matrix.md` 为准；本文件保留施工范围、验收证据要求和 Go/No-Go 契约，实际执行结果以候选提交的 CI/Actions 记录为准。

## 执行结论

ModelFaucet 已具备成为真实产品的骨架：多租户数据模型、短期 session、OpenAI-compatible Chat Completions、LiteLLM provider 路由、定点计价与复式分录、开发者 token、Dashboard/CRM demo、CI、容器与运维文档都已经存在；源码级 build/lint/typecheck/test/docs/security gates 当前全部通过。

施工前审计识别了以下四个生产闭环缺口；W0–W5 已在源码、本地和 Docker CI 范围内关闭，真实 managed staging 仍须按本计划取得外部证据：

1. 编译后的 API/Gateway 不能被当前 `start` 命令直接启动，现有容器预计启动即失败。
2. provider 调用、余额检查、预算和账本写入的事务边界无法保证真实成本与余额一致。
3. Dashboard、usage 数据、路由策略、限流和测试管理端点尚未形成可上线的权限边界。
4. 真实 provider、持久数据库、备份恢复、监控告警和回滚没有在 staging 形成证据链。

最快且专业的路径不是继续扩功能，而是冻结一个非常窄的 invite-only Beta，在 10–15 个工作日内把这一条链路做实：

`pilot app → session → 非流式 chat completion → 单一平台模型 → 原子预留/结算 → 受保护 usage → 可观测 staging → 小流量 canary`

## Beta 范围边界

### 首发必须包含

- 3–5 个受邀 pilot app，单区域、人工 onboarding。
- 仅 `POST /v1/chat/completions`，仅非流式。
- 单一 platform provider、1–2 个固定模型、服务端 allowlist 与价格表。
- session token、app/session 级成本上限、可靠幂等、余额预留与最终结算。
- operator 管理的试用 credits；完整 usage/ledger/reconciliation。
- 真实域名、TLS、managed PostgreSQL、managed Redis、密钥管理、日志、指标、告警、备份和回滚。
- CRM demo 作为唯一 golden path；文档只承诺实际验证过的能力。

### 首发明确不包含

- streaming、`/v1/responses`、`/v1/embeddings`。
- BYOK、developer-key route、Local Bridge、浏览器扩展和公开 npm SDK。
- Stripe 真实收款、Stripe Connect、自动 payout、公开开发者自助注册。
- 多 provider 智能路由、异步 rating/settlement worker、多区域和 GA SLA。

这些非目标必须由服务端 feature flag 关闭，并在 README、官网、API spec、白皮书和 release notes 中统一标为 roadmap，而不只是“暂时不宣传”。

## 当前证据矩阵

| 维度             | 状态       | 已有证据                                                                               | Beta 缺口                                                             |
| ---------------- | ---------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 源码质量         | 已验证     | clean CI 完成 build/lint/typecheck/test/docs/security；API 70、Gateway 47 个测试通过   | managed staging 的真实依赖与流量证据仍待完成                          |
| 文档与视觉       | 已验证     | 官网、Dashboard、CRM、白皮书和 Pages 构建通过；`main` Pages 部署成功                   | 真实 pilot 反馈与可用性观察仍待完成                                   |
| 生产启动         | 已验证     | API/Gateway production bundle 与三服务非 root image build/start/health smoke 通过      | managed ingress、TLS 和多实例部署仍待完成                             |
| Hosted Dashboard | 已验证     | runtime `/config.js`、安全响应头、SPA fallback 与无 localhost smoke 通过               | 目标域名、operator token 和 pilot app 仍待托管环境配置                |
| 资金一致性       | 已验证     | PostgreSQL 预留/幂等/结算、100 路低余额并发、reconciliation 与异常状态测试通过         | 真实 provider 账单抽样与未知结果人工对账仍待完成                      |
| 权限与成本控制   | 已验证     | owner-scoped usage、origin/app/session spend、Redis 限流和 production flags 通过       | 托管环境 kill switch、egress 与多实例限流演练仍待完成                 |
| 数据演进         | 已验证     | checksum migration、零额度 bootstrap、独立 backup/restore drill 与不变量检查通过       | managed backup retention/PITR 与目标环境 restore 仍待完成             |
| 外部集成         | 镜像已验证 | 三个 GHCR digest 已 pull/run，SLSA provenance 与发布提交/tag 一致                      | 真实 provider、DNS/TLS、managed DB/Redis 和告警路由证据仍缺           |
| 运维韧性         | 仓库已验证 | 依赖型 readiness、受保护 metrics、告警单测、backup/restore 和 rollback runbook 通过    | 托管 scrape/route/test-fire、15 分钟 rollback 与 on-call 演练仍待完成 |
| 发布可追溯性     | 已发布     | annotated tag、双语 prerelease、自动 source archives、digest artifacts 与 attestations | hosted promotion、provider canary、soak 和 pilot 证据仍待完成         |

## 依赖顺序与施工包

### W0 — 冻结范围与恢复事实一致性（0.5–1 天，P0）

**目标**：所有人对“Beta 到底是什么”只有一个答案，并建立可追溯候选基线。

**施工**：

- 接受本计划的默认边界：invite-only、单 provider、非流式、人工 credits、无 payout/BYOK/Local。
- 审阅并提交当前 64 个已跟踪改动和未跟踪路由/审计文件；把不属于 Beta 的改动从候选中剥离。
- 建立 `v1.3.0-beta.1` release branch/候选提交，不再以本地 `1.3.0 Source GA` 口径推进。
- 新增一份 capability matrix：`implemented / locally verified / staging verified / unavailable`，让 README、官网、API spec、白皮书和 release notes 引用同一事实源。
- 确认唯一 provider、模型、地区、数据保留期、人工 credits 额度和 pilot 名单。

**验收**：候选提交干净；所有公开材料不再承诺未实现能力；产品负责人签字确认 out-of-scope。

### W1 — 让发布产物真正可运行（1.5–2.5 天，P0）

**目标**：从干净 clone 构建的产物可被 production 命令和容器启动。

**施工**：

- 修复 API/Gateway 的 ESM 输出。优先采用 NodeNext + 源码 `.js` import 或单入口生产 bundling；不要在 production 使用 `tsx` 或实验性 specifier flag 掩盖问题。
- 把 `start-after-build` 变成 API/Gateway 包级测试，并在 CI 启动进程后请求 `/health`、`/ready`。
- 将 Dashboard API base URL 变为明确的 build arg/runtime config；去除生产默认 `localhost` 与硬编码 `app_pub_demo`。
- 用多阶段镜像只复制运行时依赖和目标产物；非 root 运行；Dashboard 改由稳定静态 server 提供，而不是 `vite preview`。
- 固定 Node、Redis、LiteLLM 和 ModelFaucet image 的精确版本或 digest，禁止 hosted 默认 `latest`/`main-latest`。
- liveness 只检查进程；readiness 实际检查 PostgreSQL、Redis，Gateway 还要检查可用 provider 路径。依赖失败时必须退出负载均衡。

**验收**：clean clone → build images → start → health/readiness → shutdown 全自动通过；从 registry pull 的 digest 与 CI 产物一致；Dashboard 浏览器请求真实 HTTPS API 地址。

### W2 — 建立可演进且不污染资金的数据基线（1–2 天，P0）

**目标**：staging/production 只执行可追踪迁移，永不运行 demo seed。

**施工**：

- 把 `schema.sql` 固化为 `0001` 基线，建立有序、一次性、可审计的 migration runner；记录 checksum、执行时间和应用版本。
- 将 `seed.sql` 明确限制为 local/test fixture。移除 hosted/operations 文档中的 production `db:seed` 步骤。
- 新增幂等 operator bootstrap，只创建指定 developer/app/model policy，不覆盖已有 wallet balance，不创建公共 demo 资金。
- 为余额和关键状态增加数据库约束；金融写入必须通过 ledger/adjustment 事务，不允许直接覆盖余额。
- 在空库、旧 v1.2 快照和 migration 重跑三种场景验证；准备 forward-fix，不把危险 schema rollback 当默认策略。

**验收**：同一 production migration 连续运行两次无资金变化；wallet 与 ledger reconciliation 为零差异；旧快照升级成功；无 `app_pub_demo` 或测试余额进入 staging/prod。

### W3 — 重做请求、成本和账本的原子边界（3–5 天，P0，核心路径）

**目标**：任何成功、失败、超时、重试和并发场景都不能产生负余额、重复收费或无记录上游成本。

**推荐状态机**：

1. **短事务预检/预留**：验证 session、app/feature policy、模型 allowlist、app/session budget 和客户端 idempotency key；锁定 wallet/budget；按 `max_tokens` 与固定价格表预留最大成本；写入 `pending` attempt。
2. **事务外 provider 调用**：释放数据库连接后调用固定 LiteLLM/provider；向日志传播 request/idempotency/provider request ID。
3. **短事务结算**：锁定 pending attempt；按真实 token usage 和服务端 price card 写 usage + 四类 ledger entry；扣实际金额、释放差额、标记 succeeded。
4. **失败补偿**：明确 provider rejection、timeout、unknown outcome、DB finalize failure 的状态；释放确定失败的预留，unknown 保留可恢复记录并触发告警/人工 reconciliation。

**施工要点**：

- 强制 `Idempotency-Key`；相同 app/session/key/body 返回同一结果或状态冲突，不重复调用 provider。
- wallet 使用行锁/条件更新并增加非负约束；预算也必须在并发安全的预留中扣占。
- 客户端不得通过 metadata 选择 developer credential；首发强制 platform route。
- 模型由 app/feature 服务端 allowlist 决定；仅开放固定 1–2 个模型，并限制 input、`max_tokens`、单次最大美元成本。
- 建立版本化 price card；禁止硬编码每次 `$0.00010000`。对 provider usage 缺失、估算和价格表不匹配分别记录并可拒绝结算。
- 暂时关闭 BYOK/developer-key route，直到它们拥有同样的 allowlist、预算预留、SSRF 和审计保证。

**验收**：

- 100 个并发请求竞争一个低余额 wallet，最终余额非负且 ledger 精确对账。
- 同一 idempotency key 并发/串行重放只产生一次 provider attempt 和一次 usage。
- 余额不足、预算不足在 provider 调用前被拒绝。
- provider timeout、5xx、成功后 DB 短暂失败均有确定状态、告警和可恢复操作。
- price card 对固定 token 样本的金额逐分厘一致，并与 provider 账单抽样核对。

### W4 — 封闭权限、滥用与支付边界（2–3 天，可与 W3 后半并行，P0）

**目标**：只有正确主体能看到数据、管理 app 或消耗预算，未上线能力在部署层不可达。

**施工**：

- 给 app usage 增加 developer/operator auth 与 owner check；增加分页，避免公开 app ID 泄漏逐请求成本数据。
- 最快 Beta 不开放自助 Dashboard：由 operator 通过受保护 Control API onboarding；若 pilot 必须查看 usage，提供只读、短期 scoped token，而不是把 admin token 注入静态前端。
- 为 `/v1/sessions` 增加 app 级启停、允许 origin、session 创建速率、日/月 spend cap 和 kill switch。
- 限流 label 改用 Fastify route pattern；未知路径进入固定桶。按真实代理 IP + app/session 分层计数，显式配置可信 proxy hops。
- Redis 限流改用 Lua/MULTI 原子完成 increment + expiry；metrics label 使用固定低基数 route，并把 `/metrics` 限制在内部网络。
- production feature flag 完全关闭 `credit-test-balance`、payout、developer-key/BYOK 和 Stripe endpoints。人工充值使用有 actor、reason、request ID 的 admin adjustment。
- 如果后续启用 Stripe：必须先使用原始 webhook bytes、强制 secret、timestamp tolerance、test-mode replay 和重复/伪造事件测试。
- BYOK 恢复前补 DNS 解析后私网 IP 检查、出站 egress policy、密钥版本/轮换和真实 credential validation。

**验收**：跨租户 usage/app/key/wallet 请求全部 401/403；未知路径洪泛不产生无界 metrics key；app spend cap 与 kill switch 在并发下生效；所有被裁剪端点在 production 返回 404/disabled。

### W5 — 建立真实 staging 与运营闭环（2–3 天，P0）

**目标**：用与生产同构的环境证明真实 provider、数据恢复和故障响应。

**施工**：

- 单区域部署 API、Gateway、Dashboard/CRM；使用 managed PostgreSQL、managed Redis、secret manager、TLS 和固定镜像 digest。
- LiteLLM 只配置已审核 provider/model；确认 provider 的转售/BYOK、数据使用、地区、保留和速率条款。
- 结构化日志至少包含 request ID、app ID、session hash prefix、idempotency key hash、route/model、provider request ID、attempt state、token、价格版本和错误类别；绝不记录 prompt、原始用户 ID、token 或 provider key。
- 抓取低基数 metrics，并建立最小告警：5xx、provider error/timeout、pending attempt 堆积、reconciliation 差异、负余额约束失败、预算接近上限、DB/Redis pool、readiness、备份失败。
- 自动 PostgreSQL 备份；完成一次独立环境 restore；形成 deploy、rollback、provider kill、app disable、manual adjustment 与 incident runbook。
- 运行真实 provider E2E、并发、幂等、故障注入和 60 分钟预计峰值 soak。

**验收**：真实 provider golden path 成功；所有关键告警至少触发一次；restore 后 reconciliation 一致；旧 digest 可在 15 分钟内回滚；operator 能在 5 分钟内关闭单 app 或全部 provider 流量。

### W6 — Pilot 发布与逐级放量（1–2 天，P0）

**目标**：以可回滚、可支持的方式接入第一批真实用户。

**施工**：

- 为每个 pilot 建独立 app、预算、模型 allowlist、origin 和联系人；默认极低额度。
- 已发布 `v1.3.0-beta.1`：干净 annotated tag、双语 prerelease、GitHub source archives、image digest artifacts、SLSA provenance、migration version 和已知限制。
- 先内部流量，再 1 个 pilot，再全部 3–5 个 pilot；每一级至少观察一个完整业务周期。
- 每日检查 provider 成本 vs usage/ledger、错误分布、pending attempts、余额、预算与支持反馈。
- 达到 stop condition 立即 disable app/provider 或回滚：reconciliation 非零、重复扣费、未授权数据访问、成本失控、持续 5xx、无法恢复的 pending attempt。

**验收**：连续 72 小时无 P0/P1 数据或资金事故；账单抽样一致；pilot 能独立完成集成；runbook 和支持联系人有效。之后再决定是否扩到更多 app，而不是自动升级为 GA。

## Go / No-Go 门禁

以下项目必须全部为绿，才能接入任何真实外部用户：

- [x] API/Gateway production build + start + container health 在 clean CI 中真实执行。
- [x] registry digest pull/run 与候选提交一致；hosted 不使用浮动 tag。
- [x] Dashboard/CRM 不请求 localhost，无公开 usage 数据，无 admin secret 注入浏览器。
- [ ] staging 只运行 migration/bootstrap，不运行 demo seed；wallet/ledger reconciliation 为零。
- [x] provider 调用在数据库事务外；余额/预算预留、幂等和最终结算通过并发/故障测试。
- [x] 价格表、模型 allowlist、单次/app/session 成本上限由服务端强制。
- [ ] 真实 provider golden path 成功，且 provider 费用抽样能与 usage/ledger 对上。
- [ ] tenant isolation、权限、限流高基数、SSRF/egress 和 secret leakage 测试通过。
- [x] payment、payout、BYOK、developer key、Local Bridge 等非 Beta 能力在 production 不可达。
- [ ] readiness、日志、metrics、告警、备份 restore、rollback 和 kill switch 均实际演练。
- [x] README、官网、API spec、白皮书、release notes 与 capability matrix 一致。
- [x] 候选提交干净；build/lint/typecheck/test/docs/secrets/security audit 全部从零执行。

## 人员与时间盒

推荐最小施工单元：

- Backend A：W1、W2、API auth/limits。
- Backend B：W3 的 idempotency/reservation/ledger/pricing。
- Platform/SRE（可兼职）：W1 镜像、W5 环境/监控/备份/回滚。
- Product/Ops（可兼职）：W0 范围、provider 条款、pilot onboarding、文档事实矩阵。

两名工程师加兼职 Platform/Ops，目标是 **10–15 个工作日**进入受控 Beta；单人施工按 **3–4 周**更现实。若把真实 Stripe、BYOK、Local Bridge、streaming 或公开 SDK 加回首发范围，预计至少再增加 **2–4 周**，并显著扩大安全与对账风险。

## 前 48 小时建议动作

1. 书面确认 Beta 范围，选择唯一 provider/model，确认不接真实付款和 payout。
2. 整理当前 dirty worktree，形成可审阅的 `v1.3.0-beta.1` 基线提交。
3. 先修 production start、Dashboard API config 和 image start smoke；当天拿到第一份“容器真的运行”的证据。
4. 把 production seed 从所有 hosted/runbook 流程移除，建立 migration/bootstrap 边界。
5. 为 W3 写并发余额、幂等重放、provider-before-balance 三个失败测试，再开始修改事务模型。

## Beta 后的优先级

### P1：Beta 稳定后立即推进

- 自助开发者登录/BFF、只读与管理 scope 分离。
- Stripe test → live 的完整收款闭环与退款/争议处理。
- BYOK/developer key 的预算、allowlist、SSRF、密钥轮换与验证。
- SDK 可安装产物、版本/exports/types、一个可维护的外部 quickstart。
- streaming 的中断计费、partial usage 与幂等语义。
- 指标持久化、SLO、审计日志 actor attribution、数据保留/删除流程。

### P2：不要阻塞首个 Beta

- `/v1/responses`、`/v1/embeddings`、多 provider 智能路由。
- Local Bridge 云端 usage 同步、浏览器扩展、桌面 UI。
- rating/settlement 异步 worker、自动 payout、KYC/税务。
- 多区域、公共 marketplace、GA SLA、完整白皮书重版。
- API 大文件的继续模块化、依赖大版本升级、视觉重设计。

## 关键源文件与公开事实

- 生产启动与容器：`apps/api/package.json`、`apps/gateway/package.json`、`tsconfig.base.json`、`infra/docker/node-service.Dockerfile`、`infra/hosted/docker-compose.hosted.yml`
- 资金与路由：`apps/gateway/src/repositories/mockCompletionRepository.ts`、`packages/shared/src/pricing.ts`、`infra/db/schema.sql`、`infra/db/seed.sql`
- 权限与可观测性：`apps/api/src/server.ts`、`apps/gateway/src/server.ts`、`packages/shared/src/observability.ts`
- 产品事实：`README.md`、`docs/API_SPEC.md`、`docs/provider-routing.md`、`docs/hosted-beta.md`、`ModelFaucet_Whitepaper_CN.pdf`
- 公开仓库：[GitHub](https://github.com/HiClawBot/modelfaucet)｜[Releases](https://github.com/HiClawBot/modelfaucet/releases)｜[Pages](https://hiclawbot.github.io/modelfaucet/)
