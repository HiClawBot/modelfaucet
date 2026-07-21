#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function readText(path) {
  return readFileSync(new URL(path, `${new URL(repoRoot, "file:")}/`), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  const rootPackage = readJson("package.json");
  const websitePackage = readJson("apps/website/package.json");
  const version = rootPackage.version;
  assert(
    /^\d+\.\d+\.\d+-beta\.\d+$/.test(version),
    "Root version must be a numbered Beta prerelease."
  );
  assert(websitePackage.version === version, "Website and root release versions must match.");
  assert(
    readText("CHANGELOG.md").includes(`## ${version} -`),
    "Changelog must contain the exact candidate version."
  );
  assert(
    readText("README.md").includes(`\`v${version}\` construction candidate`),
    "English README candidate version is stale."
  );
  assert(
    readText("README.zh-CN.md").includes(`\`v${version}\` 施工候选`),
    "Chinese README candidate version is stale."
  );
  assert(
    readText("docs/capability-matrix.md").includes(`Target: \`v${version}\``),
    "Capability matrix target is stale."
  );
  assert(
    readText("docs/API_SPEC.md").includes(`Version: v${version} construction candidate`),
    "API specification version is stale."
  );

  const releaseTag = process.env.RELEASE_TAG?.trim();
  if (releaseTag) {
    assert(releaseTag === `v${version}`, `Release tag ${releaseTag} must equal v${version}.`);
  }

  if (process.env.REQUIRE_CLEAN_WORKTREE === "1") {
    const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    assert(status.trim() === "", "Release verification requires a clean Git worktree.");
  }

  console.log(`Release candidate metadata verification passed for v${version}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
