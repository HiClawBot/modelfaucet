# Billing 和 Settlement

ModelFaucet `0.7.0` 的目标是在任何真实 payout 集成前，让资金流可审计。当前版本仍以 test mode 为主：Stripe top-up 使用服务端 Stripe 凭据，payout 执行仍是 mock/dev-mode，并且任何 payout 在 mark-paid 前都必须经过显式 operator approval。

## 安全边界

- Provider API key 只保留在服务端，不会进入 settlement report。
- BYOK 仍然是用户/开发者显式动作，不存在隐藏 BYOK markup。
- 云服务不会抓取 localhost 或私有 LAN URL。
- Stripe webhook replay 是 operator 工具。默认只发送到本地 API；如果要发送到远端目标，必须设置 `ALLOW_REMOTE_WEBHOOK_REPLAY=1`。
- Payout 不是自动真实打款。`run-mock` 只创建可审核 payout 记录；必须先 `approve`，才能 `mark-paid`。

## Stripe Test-Mode Replay

先启动 API，并配置 test database 和可选的 `STRIPE_WEBHOOK_SECRET`，然后重放 checkout completion event：

```bash
MODELFAUCET_API_BASE_URL=http://127.0.0.1:3201 \
STRIPE_WEBHOOK_SECRET=whsec_test_local \
STRIPE_CHECKOUT_SESSION_ID=cs_test_123 \
STRIPE_AMOUNT_CENTS=500 \
pnpm stripe:webhook:replay
```

如果本地没有对应 checkout session，脚本默认把签名和路由检查视为通过。若需要端到端 credit 检查，先通过 `POST /v1/user/stripe/checkout-sessions` 创建 pending checkout session，再用匹配的 `STRIPE_CHECKOUT_SESSION_ID` 和金额 replay；同时可设置 `REQUIRE_WEBHOOK_CREDIT=1`。

## Ledger Reconciliation

运营者可以用以下接口验证 wallet balance 与 ledger entries 是否一致：

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3201/v1/admin/reconciliation/ledger
```

Fresh seed 数据现在会为 demo end-user test credits 写入 `seed_opening_balance` ledger entry，因此本地 smoke path 中 reconstructed ledger balance 会与 wallet balance 匹配。

## Completion 预留与幂等

Gateway 不会在 provider 调用期间保持数据库事务，资金路径分为三个有界阶段：

1. 短事务验证 session、model、budget policy；只有可用余额足以覆盖服务端计算的单次最坏价格时，才增加 `wallets.reserved_balance_usd`。
2. Provider 调用在事务外执行，并使用稳定 Gateway request ID 作为上游幂等键。
3. 短结算事务写入一条 usage、四条 ledger，按实际 token 计费、释放预留并保存可重放结果。

明确的 provider failure 会释放预留并保存可重放失败。结果不确定或 provider 超出服务端 token cap 时，记录转为 `requires_review` 并继续冻结预留。Operator 必须先核对 provider log，再决定释放或补偿；不得自动重试：

```sql
select request_id, status, reserved_retail_price_usd, reservation_expires_at
from gateway_completion_requests
where status = 'requires_review'
   or (status = 'reserved' and reservation_expires_at <= now())
order by created_at;
```

## Adjustment、Refund 和 Chargeback

Admin adjustment 是显式 ledger event：

```bash
curl -X POST http://127.0.0.1:3201/v1/admin/wallets/$WALLET_ID/adjustments \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "refund",
    "direction": "credit",
    "amount_usd": "2.50000000",
    "reason": "test-mode refund",
    "idempotency_key": "refund-demo-001"
  }'
```

`kind` 支持 `adjustment`、`refund` 和 `chargeback`。Debit adjustment 需要 wallet balance 足够。建议 operator workflow 和 webhook retry 都传入 `idempotency_key`。

## Payout Review

Payout review flow 是刻意显式的：

```bash
curl -X POST http://127.0.0.1:3201/v1/admin/payouts/run-mock \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"threshold_usd":"1.00000000"}'

curl -X POST http://127.0.0.1:3201/v1/admin/payouts/$PAYOUT_ID/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"operator_note":"reviewed against ledger reconciliation"}'

curl -X POST http://127.0.0.1:3201/v1/admin/payouts/$PAYOUT_ID/mark-paid \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

没有通过 approval 进入 `processing` 状态的 payout 会被 `mark-paid` 拒绝。

## CSV Reports

API 提供 admin CSV 导出：

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3201/v1/admin/reports/usage.csv

curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3201/v1/admin/reports/revenue.csv

curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3201/v1/admin/reports/payouts.csv
```

这些导出用于 reconciliation 和 review，不包含 provider secret 或原始 BYOK 值。
