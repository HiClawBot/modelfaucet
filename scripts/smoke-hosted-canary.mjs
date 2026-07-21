#!/usr/bin/env node
import { readHostedCanaryConfig, runHostedCanary } from "./hosted-canary-lib.mjs";

try {
  const result = await runHostedCanary(readHostedCanaryConfig());
  console.log(JSON.stringify(result, null, 2));
  console.log("Hosted billable canary passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
