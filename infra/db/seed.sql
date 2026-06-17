-- ModelFaucet development seed

insert into developers (name, email, status)
values ('Demo Developer', 'dev@example.com', 'active')
on conflict (email) do nothing;

insert into apps (developer_id, public_app_id, name, vertical, default_revenue_share_bps, status)
select id, 'app_pub_demo', 'CRM Demo', 'crm', 4000, 'active'
from developers
where email = 'dev@example.com'
on conflict (public_app_id) do nothing;

insert into app_features (app_id, feature_key, display_name, policy, pricing)
select
  apps.id,
  'customer_reply',
  '客户回复生成',
  '{"route_preference":["local","end_user_byok","developer_key","platform_pool"],"privacy":"redact_pii_before_cloud","model_policy":"cheapest_sufficient"}'::jsonb,
  '{"mode":"usage_markup","markup_percent":30,"channel_share_bps":4000}'::jsonb
from apps
where public_app_id = 'app_pub_demo'
on conflict (app_id, feature_key) do nothing;

insert into end_users (app_id, external_user_hash, metadata)
select
  apps.id,
  'sha256:ce028a7fdc9eb8b2725cb3d9c2cd6546c287e40c69162e2b6dc948f8947d0885',
  '{"seed":"crm-demo"}'::jsonb
from apps
where public_app_id = 'app_pub_demo'
on conflict (app_id, external_user_hash) do update
set
  metadata = end_users.metadata || excluded.metadata,
  updated_at = now();

-- Platform wallet and provider cost account.
insert into wallets (owner_scope, owner_id, balance_usd)
values ('platform', '00000000-0000-0000-0000-000000000001', 0)
on conflict (owner_scope, owner_id) do nothing;

insert into wallets (owner_scope, owner_id, balance_usd)
values ('provider_cost', '00000000-0000-0000-0000-000000000002', 0)
on conflict (owner_scope, owner_id) do nothing;

-- Developer wallet.
insert into wallets (owner_scope, owner_id, balance_usd)
select 'developer', id, 0
from developers
where email = 'dev@example.com'
on conflict (owner_scope, owner_id) do nothing;

-- End user test wallet.
insert into wallets (owner_scope, owner_id, balance_usd)
select 'end_user', end_users.id, 10.00
from end_users
join apps on apps.id = end_users.app_id
where
  apps.public_app_id = 'app_pub_demo'
  and end_users.external_user_hash = 'sha256:ce028a7fdc9eb8b2725cb3d9c2cd6546c287e40c69162e2b6dc948f8947d0885'
on conflict (owner_scope, owner_id) do update
set
  balance_usd = excluded.balance_usd,
  updated_at = now();
