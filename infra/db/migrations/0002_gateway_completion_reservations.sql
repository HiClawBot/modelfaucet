alter table wallets
  add column reserved_balance_usd numeric(18,8) not null default 0;

alter table wallets
  add constraint wallets_reserved_balance_non_negative
  check (reserved_balance_usd >= 0);

alter table wallets
  add constraint wallets_reserved_balance_within_balance
  check (reserved_balance_usd <= balance_usd);

create table gateway_completion_requests (
  id uuid primary key default uuid_generate_v4(),
  request_id text unique not null,
  session_id uuid not null references virtual_sessions(id),
  app_id uuid not null references apps(id),
  developer_id uuid not null references developers(id),
  end_user_id uuid not null references end_users(id),
  idempotency_key_hash text not null,
  request_fingerprint text not null,
  status text not null check (status in ('reserved', 'settled', 'failed', 'requires_review')),
  route_mode text not null check (route_mode in ('platform', 'developer_key', 'byok')),
  provider_credential_id uuid references provider_credentials(id),
  wallet_id uuid not null references wallets(id),
  reserved_retail_price_usd numeric(18,8) not null check (reserved_retail_price_usd >= 0),
  reserved_upstream_cost_usd numeric(18,8) not null check (reserved_upstream_cost_usd >= 0),
  reservation_expires_at timestamptz not null,
  result jsonb,
  failure_code text,
  failure_status int,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  unique(session_id, idempotency_key_hash)
);

create index idx_gateway_completion_requests_status_expiry
  on gateway_completion_requests(status, reservation_expires_at);

create index idx_gateway_completion_requests_credential_status
  on gateway_completion_requests(provider_credential_id, status)
  where provider_credential_id is not null;
