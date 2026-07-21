#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function required(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function sqlLiteral(value) {
  if (value.includes("\0")) {
    throw new Error("Bootstrap values must not contain null bytes.");
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function optionalSqlLiteral(value) {
  return value === undefined || value.trim() === "" ? "null" : sqlLiteral(value.trim());
}

function positiveMoney(name, value) {
  if (!/^(0|[1-9]\d*)(\.\d{1,8})?$/.test(value) || Number(value) <= 0) {
    throw new Error(`${name} must be a positive USD amount with at most 8 decimals.`);
  }
  return value;
}

try {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("NODE_ENV=production is required for production bootstrap.");
  }
  const databaseUrl = required("DATABASE_URL");
  const developerName = required("BOOTSTRAP_DEVELOPER_NAME");
  const developerEmail = required("BOOTSTRAP_DEVELOPER_EMAIL").toLowerCase();
  const publicAppId = required("BOOTSTRAP_APP_PUBLIC_ID");
  const appName = required("BOOTSTRAP_APP_NAME");
  const appVertical = process.env.BOOTSTRAP_APP_VERTICAL;
  const revenueShareBps = Number(process.env.BOOTSTRAP_REVENUE_SHARE_BPS ?? "4000");
  const allowedOrigins = required("BOOTSTRAP_APP_ALLOWED_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const monthlySpendLimit = positiveMoney(
    "BOOTSTRAP_APP_MONTHLY_SPEND_LIMIT_USD",
    required("BOOTSTRAP_APP_MONTHLY_SPEND_LIMIT_USD")
  );
  const sessionSpendLimit = positiveMoney(
    "BOOTSTRAP_SESSION_SPEND_LIMIT_USD",
    required("BOOTSTRAP_SESSION_SPEND_LIMIT_USD")
  );

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(developerEmail)) {
    throw new Error("BOOTSTRAP_DEVELOPER_EMAIL must be an email address.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(publicAppId)) {
    throw new Error("BOOTSTRAP_APP_PUBLIC_ID contains unsupported characters.");
  }
  if (!Number.isInteger(revenueShareBps) || revenueShareBps < 0 || revenueShareBps > 10_000) {
    throw new Error("BOOTSTRAP_REVENUE_SHARE_BPS must be an integer from 0 to 10000.");
  }
  if (allowedOrigins.length === 0) {
    throw new Error("BOOTSTRAP_APP_ALLOWED_ORIGINS must include at least one HTTPS origin.");
  }
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) {
      throw new Error("BOOTSTRAP_APP_ALLOWED_ORIGINS must contain exact HTTPS origins.");
    }
  }
  const allowedOriginsSql = `array[${allowedOrigins.map(sqlLiteral).join(",")}]::text[]`;

  const sql = `
begin;
insert into developers(name, email, status)
values (${sqlLiteral(developerName)}, ${sqlLiteral(developerEmail)}, 'active')
on conflict (email) do nothing;

insert into apps(
  developer_id,
  public_app_id,
  name,
  vertical,
  default_revenue_share_bps,
  allowed_origins,
  monthly_spend_limit_usd,
  session_spend_limit_usd,
  status
)
select
  developers.id,
  ${sqlLiteral(publicAppId)},
  ${sqlLiteral(appName)},
  ${optionalSqlLiteral(appVertical)},
  ${revenueShareBps},
  ${allowedOriginsSql},
  ${monthlySpendLimit},
  ${sessionSpendLimit},
  'active'
from developers
where email = ${sqlLiteral(developerEmail)}
on conflict (public_app_id) do nothing;

update apps
set
  allowed_origins = ${allowedOriginsSql},
  monthly_spend_limit_usd = ${monthlySpendLimit},
  session_spend_limit_usd = ${sessionSpendLimit},
  updated_at = now()
from developers
where apps.developer_id = developers.id
  and apps.public_app_id = ${sqlLiteral(publicAppId)}
  and developers.email = ${sqlLiteral(developerEmail)};

do $bootstrap_check$
begin
  if not exists (
    select 1
    from apps
    join developers on developers.id = apps.developer_id
    where apps.public_app_id = ${sqlLiteral(publicAppId)}
      and developers.email = ${sqlLiteral(developerEmail)}
  ) then
    raise exception 'Bootstrap app exists under another developer';
  end if;
end
$bootstrap_check$;

insert into wallets(owner_scope, owner_id, balance_usd)
values
  ('platform', '00000000-0000-0000-0000-000000000001', 0),
  ('provider_cost', '00000000-0000-0000-0000-000000000002', 0)
on conflict (owner_scope, owner_id) do nothing;

insert into wallets(owner_scope, owner_id, balance_usd)
select 'developer', id, 0
from developers
where email = ${sqlLiteral(developerEmail)}
on conflict (owner_scope, owner_id) do nothing;
commit;

select
  'developer_id=' || developers.id || E'\\napp_id=' || apps.id || E'\\npublic_app_id=' || apps.public_app_id
from apps
join developers on developers.id = apps.developer_id
where apps.public_app_id = ${sqlLiteral(publicAppId)};
`;

  const result = spawnSync(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", databaseUrl],
    {
      input: sql,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    }
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Production bootstrap failed.");
  }
  console.log(result.stdout.trim());
  console.log("Production bootstrap completed without creating credits or changing balances.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
