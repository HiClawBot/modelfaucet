#!/usr/bin/env node
process.env.SMOKE_PROVIDER_MODE = "external";
await import("./smoke-local-stack.mjs");

