# Threat 和 Abuse Model

ModelFaucet `0.8.0` 在 hosted pilot 之前对源码 beta 做安全加固。本文件记录最高风险的误用路径，以及每个版本都必须保留的控制措施。

## 安全不变量

1. Provider API key 只保留在服务端。
2. BYOK 行为必须显式，不允许隐藏 BYOK markup。
3. 云服务不能访问 localhost、metadata service 或私有 LAN URL。
4. Local Bridge 可以访问 localhost/LAN，是因为它运行在用户本地信任边界内。
5. 资金流在 payout transition 前必须可审计。

## Threat Model

| Threat | Impact | 当前控制 |
| --- | --- | --- |
| Client bundle 包含 provider credentials | Provider account compromise | Provider key 只通过 server route 接收，持久化前加密，response 只返回 masked value，并由 `pnpm verify:secrets` 扫描。 |
| BYOK base URL 指向私有网络 | SSRF 到本地、LAN 或 metadata service | 共享 `CloudSafeBaseUrlSchema` 拦截 localhost、private IPv4、carrier NAT、link-local、private IPv6、IPv4-mapped IPv6 和已知 metadata hostname。 |
| Production CORS 默认 wildcard | 跨站滥用 token/session API | 生产环境必须配置 `API_CORS_ORIGINS` 和 `GATEWAY_CORS_ORIGINS`，且不能为 `*`。 |
| Session token 被盗用重放 | 未授权模型调用 | Token 短期有效，只以 hash 存储，并校验 active app/developer/session。 |
| Provider failure 在 response 中泄漏 secret | Secret disclosure | Gateway provider attempt metadata 只包含 status/error class，不包含 bearer credentials。 |
| Payout 未审核就 mark-paid | 未授权资金移动 | `mark-paid` 必须先通过 payout approval 进入 `processing`，所有 transition 写 audit log。 |
| 已知高危依赖进入 release | Supply-chain exposure | CI 运行 `pnpm security:audit` high severity 和 `pnpm verify:secrets`。 |

## Abuse Model

| Abuse case | Detection signals | Controls |
| --- | --- | --- |
| 通过大量用户薅免费 credits | Session 创建速率异常、重复 IP/device pattern、wallet failure | IP+route rate limit、wallet balance check、未来增加 device/app-level velocity limits。 |
| 开发者创建滥用 app | 新 app traffic spike、provider error rate 高、feature metadata 可疑 | Developer admin review、audit logs、app status controls、roadmap tenant isolation checks。 |
| BYOK 被用来隐藏平台成本 | route/cost mismatch | BYOK 记录 zero platform upstream cost，并显式记录 route mode。 |
| Developer provider key budget 被耗尽 | Developer-key spend 接近 limit | Gateway 在 developer-key routing 前做 budget check。 |
| Webhook replay 重复入账 | 重复 Stripe event/session ID | Top-up crediting 通过 Stripe event/session state 保持 idempotent。 |
| Payout fraud | Payout velocity、ledger reconciliation mismatch、未审核 status | Ledger reconciliation、payout approval gate、audit logs、pending/processing review。 |

## Release 回归要求

Tag release 前：

- 运行 `pnpm verify:secrets`。
- 运行 `pnpm security:audit`。
- 运行 lint、typecheck、tests。
- 运行 docs build 和 app builds。
- 运行包含 ledger reconciliation 的 local smoke。
- 确认 API response 和 dashboard surface 不返回原始 provider key。
- 确认 production CORS 没有显式 allowlist 时不能启动。
- 确认云端 provider URL 路径会拒绝 localhost、private LAN、metadata 和 IPv4-mapped private host。

## Hosted Pilot 缺口

Hosted beta 前仍需完成：

- 真实 secret manager 集成。
- 面向 hosted data store 的 tenant/app isolation tests。
- API 和 Gateway 前面的 WAF 或 edge rate limits。
- 带告警的 Provider 和 Stripe test accounts。
- 真实 payout 所需的 KYC/AML workflow。
- Incident response contact 和 key-rotation runbook。
