#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { loadMigrationManifest } from "./migration-manifest.mjs";

function sqlLiteral(value) {
  if (value.includes("\0")) {
    throw new Error("SQL metadata must not contain null bytes.");
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function metadataCheckSql(migration) {
  return `
do $migration_check$
begin
  if not exists (
    select 1
    from schema_migrations
    where version = ${sqlLiteral(migration.version)}
      and description = ${sqlLiteral(migration.description)}
      and checksum = ${sqlLiteral(migration.checksum)}
  ) then
    raise exception 'Migration metadata mismatch for ${migration.version}';
  end if;
end
$migration_check$;
`;
}

function migrationSql(migration, index) {
  const prefix = `mf_${index}_`;
  const adoptionSql = migration.adoptLegacyChecksum
    ? `
\\echo Reconciling legacy migration ${migration.version}
${migration.sql}
update schema_migrations
set checksum = ${sqlLiteral(migration.checksum)}
where version = ${sqlLiteral(migration.version)}
  and description = ${sqlLiteral(migration.description)}
  and checksum is null;
${metadataCheckSql(migration)}
`
    : `
do $legacy_checksum$
begin
  raise exception 'Migration ${migration.version} has no checksum and cannot be adopted';
end
$legacy_checksum$;
`;

  return `
begin;
select not exists (
  select 1 from schema_migrations where version = ${sqlLiteral(migration.version)}
) as should_apply \\gset ${prefix}
select exists (
  select 1
  from schema_migrations
  where version = ${sqlLiteral(migration.version)} and checksum is null
) as should_adopt \\gset ${prefix}
\\if :${prefix}should_apply
\\echo Applying ${migration.version} from ${migration.relativeFile}
${migration.sql}
insert into schema_migrations(version, description, checksum)
values (
  ${sqlLiteral(migration.version)},
  ${sqlLiteral(migration.description)},
  ${sqlLiteral(migration.checksum)}
);
\\elif :${prefix}should_adopt
${adoptionSql}
\\else
${metadataCheckSql(migration)}
\\echo Already applied ${migration.version}
\\endif
commit;
`;
}

function buildScript(migrations) {
  return `
\\set ON_ERROR_STOP on
begin;
create table if not exists schema_migrations (
  version text primary key,
  description text not null,
  checksum text,
  applied_at timestamptz not null default now()
);
alter table schema_migrations add column if not exists checksum text;
commit;

select pg_advisory_lock(hashtextextended('modelfaucet:migrations', 0));
${migrations.map(migrationSql).join("\n")}
select pg_advisory_unlock(hashtextextended('modelfaucet:migrations', 0));
`;
}

try {
  const migrations = loadMigrationManifest();
  if (process.argv.includes("--plan")) {
    for (const migration of migrations) {
      console.log(`${migration.version}  ${migration.checksum}  ${migration.relativeFile}`);
    }
    process.exit(0);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required.");
  }

  const result = spawnSync(
    "psql",
    ["-X", "-v", "ON_ERROR_STOP=1", "-d", databaseUrl],
    {
      input: buildScript(migrations),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    }
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "psql migration failed.");
  }

  if (result.stdout.trim() !== "") {
    console.log(result.stdout.trim());
  }
  console.log(`Database migration completed with ${migrations.length} known migration(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
