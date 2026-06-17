-- ModelFaucet MVP schema
-- Version: v0.1 Draft

create extension if not exists "uuid-ossp";

create table if not exists developers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique not null,
  payout_account_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists apps (
  id uuid primary key default uuid_generate_v4(),
  developer_id uuid not null references developers(id),
  public_app_id text unique not null,
  name text not null,
  vertical text,
  default_revenue_share_bps int not null default 4000,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_features (
  id uuid primary key default uuid_generate_v4(),
  app_id uuid not null references apps(id),
  feature_key text not null,
  display_name text not null,
  policy jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(app_id, feature_key)
);

create table if not exists end_users (
  id uuid primary key default uuid_generate_v4(),
  app_id uuid not null references apps(id),
  external_user_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(app_id, external_user_hash)
);

create table if not exists provider_credentials (
  id uuid primary key default uuid_generate_v4(),
  owner_scope text not null check (owner_scope in ('platform', 'operator', 'developer', 'end_user')),
  owner_id uuid,
  provider text not null,
  base_url text,
  encrypted_secret_ref text not null,
  masked_secret text,
  models_allowed text[] default '{}',
  priority int not null default 100,
  weight int not null default 1,
  budget_limit_usd numeric(18,8),
  fallback_to_platform boolean not null default false,
  status text not null default 'active',
  last_validated_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_provider_credentials_owner on provider_credentials(owner_scope, owner_id);
create index if not exists idx_provider_credentials_status on provider_credentials(status);

create table if not exists virtual_sessions (
  id uuid primary key default uuid_generate_v4(),
  app_id uuid not null references apps(id),
  end_user_id uuid not null references end_users(id),
  token_hash text unique not null,
  scopes text[] not null default '{}',
  feature_key text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_virtual_sessions_app_user on virtual_sessions(app_id, end_user_id);
create index if not exists idx_virtual_sessions_expires on virtual_sessions(expires_at);

create table if not exists wallets (
  id uuid primary key default uuid_generate_v4(),
  owner_scope text not null check (owner_scope in ('platform', 'provider_cost', 'developer', 'end_user')),
  owner_id uuid not null,
  balance_usd numeric(18,8) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_scope, owner_id)
);

create table if not exists usage_events (
  id uuid primary key default uuid_generate_v4(),
  request_id text unique not null,
  app_id uuid not null references apps(id),
  developer_id uuid not null references developers(id),
  end_user_id uuid references end_users(id),
  feature_key text,
  route_mode text not null check (route_mode in ('platform', 'developer_key', 'byok', 'local')),
  provider text,
  model text,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cached_tokens int not null default 0 check (cached_tokens >= 0),
  upstream_cost_usd numeric(18,8) not null default 0,
  retail_price_usd numeric(18,8) not null default 0,
  gross_margin_usd numeric(18,8) not null default 0,
  channel_revenue_usd numeric(18,8) not null default 0,
  platform_revenue_usd numeric(18,8) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_events_app_created on usage_events(app_id, created_at desc);
create index if not exists idx_usage_events_developer_created on usage_events(developer_id, created_at desc);
create index if not exists idx_usage_events_end_user_created on usage_events(end_user_id, created_at desc);

create table if not exists ledger_entries (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid not null references wallets(id),
  usage_event_id uuid references usage_events(id),
  direction text not null check (direction in ('debit', 'credit')),
  amount_usd numeric(18,8) not null check (amount_usd >= 0),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ledger_entries_wallet_created on ledger_entries(wallet_id, created_at desc);
create index if not exists idx_ledger_entries_usage_event on ledger_entries(usage_event_id);

create table if not exists wallet_topups (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid not null references wallets(id),
  provider text not null,
  provider_checkout_session_id text unique not null,
  provider_event_id text unique,
  amount_usd numeric(18,8) not null check (amount_usd > 0),
  status text not null default 'pending' check (status in ('pending', 'credited', 'failed')),
  checkout_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wallet_topups_wallet_created on wallet_topups(wallet_id, created_at desc);
create index if not exists idx_wallet_topups_status on wallet_topups(status);

create table if not exists wallet_adjustments (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid not null references wallets(id),
  kind text not null check (kind in ('adjustment', 'refund', 'chargeback')),
  direction text not null check (direction in ('debit', 'credit')),
  amount_usd numeric(18,8) not null check (amount_usd > 0),
  status text not null default 'applied' check (status in ('applied')),
  reason text,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wallet_adjustments_wallet_created on wallet_adjustments(wallet_id, created_at desc);
create index if not exists idx_wallet_adjustments_kind_created on wallet_adjustments(kind, created_at desc);

create table if not exists payouts (
  id uuid primary key default uuid_generate_v4(),
  developer_id uuid not null references developers(id),
  amount_usd numeric(18,8) not null check (amount_usd > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  provider text,
  provider_payout_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_scope text not null,
  actor_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_resource on audit_logs(resource_type, resource_id, created_at desc);
create index if not exists idx_audit_logs_actor on audit_logs(actor_scope, actor_id, created_at desc);
