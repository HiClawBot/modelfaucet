#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDir = join(repoRoot, ".pages-dist");
const docsDist = join(repoRoot, "docs/.vitepress/dist");
const websiteDist = join(repoRoot, "apps/website/dist");

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function copyDir(from, to) {
  if (!existsSync(from)) {
    throw new Error(`${from} does not exist.`);
  }

  cpSync(from, to, {
    recursive: true,
    force: true
  });
}

function copyIndexToRoute(route) {
  const routeDir = join(outputDir, route);
  mkdirSync(routeDir, { recursive: true });
  cpSync(join(websiteDist, "index.html"), join(routeDir, "index.html"));
}

rmSync(outputDir, { force: true, recursive: true });

run("pnpm", ["docs:build"]);
run("pnpm", ["--filter", "@modelfaucet/website", "build"], {
  ...process.env,
  WEBSITE_BASE: process.env.WEBSITE_BASE ?? "/modelfaucet/"
});

copyDir(docsDist, outputDir);
copyDir(websiteDist, outputDir);
copyIndexToRoute("demo");
copyIndexToRoute("use-cases");

mkdirSync(dirname(join(outputDir, ".nojekyll")), { recursive: true });
writeFileSync(join(outputDir, ".nojekyll"), "");
cpSync(join(websiteDist, "index.html"), join(outputDir, "404.html"));

console.log(`Pages artifact prepared at ${outputDir}.`);
