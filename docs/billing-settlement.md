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
MODELFAUCET_API_BASE_URL=http://127.0.0.1:3001 \
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
  http://127.0.0.1:3001/v1/admin/reconciliation/ledger
```

Fresh seed data now writes a `seed_opening_balance` ledger entry for the demo
end-user test credits, so reconstructed ledger balances match wallet balances in
the local smoke path.

## Adjustments, Refunds, And Chargebacks

Admin adjustments are explicit ledger events:

```bash
curl -X POST http://127.0.0.1:3001/v1/admin/wallets/$WALLET_ID/adjustments \
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
curl -X POST http://127.0.0.1:3001/v1/admin/payouts/run-mock \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"threshold_usd":"1.00000000"}'

curl -X POST http://127.0.0.1:3001/v1/admin/payouts/$PAYOUT_ID/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"operator_note":"reviewed against ledger reconciliation"}'

curl -X POST http://127.0.0.1:3001/v1/admin/payouts/$PAYOUT_ID/mark-paid \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

`mark-paid` rejects payouts that have not entered `processing` through approval.

## CSV Reports

The API exposes admin CSV exports:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3001/v1/admin/reports/usage.csv

curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3001/v1/admin/reports/revenue.csv

curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://127.0.0.1:3001/v1/admin/reports/payouts.csv
```

These exports are operational artifacts for reconciliation and review. They do
not include provider secrets or raw BYOK values.
