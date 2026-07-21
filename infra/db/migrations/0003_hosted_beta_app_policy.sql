alter table apps
  add column allowed_origins text[] not null default '{}';

alter table apps
  add column monthly_spend_limit_usd numeric(18,8);

alter table apps
  add column session_spend_limit_usd numeric(18,8);

alter table apps
  add constraint apps_monthly_spend_limit_positive
  check (monthly_spend_limit_usd is null or monthly_spend_limit_usd > 0);

alter table apps
  add constraint apps_session_spend_limit_positive
  check (session_spend_limit_usd is null or session_spend_limit_usd > 0);

update apps
set
  allowed_origins = array['http://localhost:3204', 'http://127.0.0.1:3204'],
  monthly_spend_limit_usd = 1000.00000000,
  session_spend_limit_usd = 10.00000000
where public_app_id = 'app_pub_demo';
