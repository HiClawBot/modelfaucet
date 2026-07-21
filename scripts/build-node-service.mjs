#!/usr/bin/env node
import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";

const [entryPoint, outfile] = process.argv.slice(2);

if (entryPoint === undefined || outfile === undefined) {
  throw new Error("Usage: build-node-service.mjs <entry-point> <outfile>");
}

await rm(dirname(outfile), { recursive: true, force: true });

await build({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  sourcesContent: false,
  external: ["@fastify/cors", "fastify", "pg", "redis"],
  logLevel: "info"
});
