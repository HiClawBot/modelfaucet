# Billing And Settlement

ModelFaucet `0.7.0` makes money movement auditable before any real payout
integration. The current release is still test-mode oriented: Stripe top-ups use
server-side Stripe credentials, payout execution remains mock/dev-mode, and every
payout must pass an explicit operator approval step before it can be marked paid.

## Safety Boundaries

- Provider API keys remain server-side only and are never included in settlement
  reports.
- BYOK remains an explicit user/developer action; there is no hidden BYOK markup.
- Cloud services do not fetch localhost or private LAN URLs.
- Stripe webhook replay is an operator tool. It sends to local API targets by
  default and refuses remote targets unless `ALLOW_REMOTE_WEBHOOK_REPLAY=1` is set.
- Payouts are not automatic real-money transfers. `run-mock` creates reviewable
  payout records; `approve` is required before `mark-paid`.

## Stripe Test-Mode Replay

Run the API with a test database and optional `STRIPE_WEBHOOK_SECRET`, then replay
a checkout completion event:

```bash
MODELFAUCET_API_BASE_URL=http://127.0.0.1:3201 \
STRIPE_WEBHOOK_SECRET=whsec_test_local \
STRIPE_CHECKOUT_SESSION_ID=cs_test_123 \
STRIPE_AMOUNT_CENTS=500 \
pnpm stripe:webhook:replay
```

If the checkout session does not exist locally, the script treats the signature
and routing check as successful unless `REQUIRE_WEBHOOK_CREDIT=1` is set. For an
end-to-end credit check, first create a pending checkout session through
`POST /v1/user/stripe/checkout-sessions`, then replay the matching
`STRIPE_CHECKOUT_SESSION_ID` and amount.

## Ledger Reconciliation

Operators can verify wallet balances against ledger entries:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3201/v1/admin/reconciliation/ledger
```

Fresh seed data now writes a `seed_opening_balance` ledger entry for the demo
end-user test credits, so reconstructed ledger balances match wallet balances in
the local smoke path.

## Completion Reservations And Idempotency

The Gateway does not keep a database transaction open during a provider call.
It uses three bounded stages:

1. A short transaction validates session/model/budget policy and increments
   `wallets.reserved_balance_usd` only when available balance can cover the
   server-calculated worst-case request price.
2. The provider call runs outside the transaction with the stable Gateway
   request ID as its upstream idempotency key.
3. A short settlement transaction writes one usage event, four ledger entries,
   charges actual rated usage, releases the reservation, and stores the replay result.

Provider failures release the reservation and persist a replayable failure.
Ambiguous or over-cap outcomes become `requires_review` and keep the reservation
held. Operators must investigate provider logs before deciding whether to
release or compensate them; never auto-retry these rows:

```sql
select request_id, status, reserved_retail_price_usd, reservation_expires_at
from gateway_completion_requests
where status = 'requires_review'
   or (status = 'reserved' and reservation_expires_at <= now())
order by created_at;
```

## Adjustments, Refunds, And Chargebacks

Admin adjustments are explicit ledger events:

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

Supported `kind` values are `adjustment`, `refund`, and `chargeback`. Debit
adjustments require sufficient wallet balance. `idempotency_key` is optional but
recommended for operator workflows and webhook retries.

## Payout Review

The review flow is intentionally explicit:

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

`mark-paid` rejects payouts that have not entered `processing` through approval.

## CSV Reports

The API exposes admin CSV exports:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3201/v1/admin/reports/usage.csv

curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3201/v1/admin/reports/revenue.csv

curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3201/v1/admin/reports/payouts.csv
```

These exports are operational artifacts for reconciliation and review. They do
not include provider secrets or raw BYOK values.
