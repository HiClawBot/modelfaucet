import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(repoRoot, "infra/db/migrations/manifest.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function loadMigrationManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert(manifest.formatVersion === 1, "Migration manifest formatVersion must be 1.");
  assert(Array.isArray(manifest.migrations), "Migration manifest must include migrations.");

  const seenVersions = new Set();
  let previousVersion = "";
  const migrations = manifest.migrations.map((entry, index) => {
    assert(
      typeof entry.version === "string" && /^\d{4}_[a-z0-9_]+$/.test(entry.version),
      `Migration ${index + 1} has an invalid version.`
    );
    assert(
      typeof entry.description === "string" && entry.description.trim() !== "",
      `Migration ${entry.version} must include a description.`
    );
    assert(
      typeof entry.file === "string" && entry.file.trim() !== "",
      `Migration ${entry.version} must include a file.`
    );
    assert(!seenVersions.has(entry.version), `Duplicate migration version ${entry.version}.`);
    assert(
      previousVersion === "" || entry.version > previousVersion,
      `Migration manifest must be ordered; ${entry.version} follows ${previousVersion}.`
    );

    const filePath = resolve(dirname(manifestPath), entry.file);
    assert(
      filePath.startsWith(`${repoRoot}${sep}`),
      `Migration ${entry.version} must resolve inside the repository.`
    );
    const sql = readFileSync(filePath, "utf8");
    assert(sql.trim() !== "", `Migration ${entry.version} is empty.`);
    assert(
      !/^\s*(begin|commit|rollback)\s*;/imu.test(sql),
      `Migration ${entry.version} must not manage its own transaction.`
    );

    seenVersions.add(entry.version);
    previousVersion = entry.version;
    return {
      version: entry.version,
      description: entry.description,
      filePath,
      relativeFile: relative(repoRoot, filePath),
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
      adoptLegacyChecksum: entry.adoptLegacyChecksum === true
    };
  });

  assert(migrations.length > 0, "Migration manifest must not be empty.");
  return migrations;
}
