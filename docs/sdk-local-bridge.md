# SDK and Local Bridge

ModelFaucet `0.5.0` stabilizes the source-beta SDK and Local Bridge workflows
for app developers.

## Semver policy

Until `1.0.0`, public SDK APIs are source-beta APIs:

- Patch releases keep existing exported types and method names compatible.
- Minor releases may add optional fields and new helper methods.
- Breaking API removals should wait for a major version or be documented in the changelog.
- Provider API keys are not SDK options. Browser and desktop clients use public app IDs, short-lived sessions, BYOK endpoints, or the loopback Local Bridge.

## Session and chat

```ts
import { createFaucet } from "@modelfaucet/sdk";

const faucet = createFaucet({
  publicAppId: "app_pub_demo",
  user: { id: "demo-user-1" }
});

const result = await faucet.chat({
  feature: "customer_reply",
  input: { ticket_text: "Customer wants a refund." }
});
```

## Command-style feature calls

Use `runFeature` when an app wants a task-oriented command response instead of
raw OpenAI-compatible payload handling.

```ts
const action = await faucet.runFeature({
  feature: "support_action",
  input: {
    ticket: "Customer asks for a refund after late shipping.",
    plan: "pro"
  }
});

console.log(action.text);
console.log(action.usage);
console.log(action.modelfaucet.request_id);
```

## React usage display

```tsx
import { FaucetFeatureCommand, FaucetProvider } from "@modelfaucet/react";

export function SupportCommand() {
  return (
    <FaucetProvider publicAppId="app_pub_demo" userId="demo-user-1">
      <FaucetFeatureCommand
        feature="support_action"
        initialInput='{"ticket":"late shipping refund"}'
      />
    </FaucetProvider>
  );
}
```

`FaucetFeatureCommand` renders the normalized result text and a `FaucetUsage`
summary with request ID, route mode, model, tokens, and local usage-report
status when available.

## Local Bridge diagnostics

The Local Bridge stays loopback-bound by default:

```bash
modelfaucet-bridge start --port 8787
```

The bridge exposes:

```txt
GET  /health
GET  /diagnostics
GET  /models
POST /v1/chat/completions
POST /usage/report
```

`/diagnostics` reports loopback binding and local upstream reachability without
returning upstream API keys.

The SDK can diagnose the local path:

```ts
const diagnostics = await faucet.local.diagnose();

if (!diagnostics.available || diagnostics.problems.length > 0) {
  console.warn(diagnostics.problems);
}
```

## Offline local usage reporting

Local model calls return even if usage reporting is temporarily unavailable. The
SDK queues failed local usage reports in memory and lets the app flush them later:

```ts
const localResult = await faucet.chat({
  feature: "customer_reply",
  routeMode: "local",
  model: "ollama:qwen2.5:7b",
  input: "Draft a reply."
});

console.log(localResult.modelfaucet?.usage_report_status);
console.log(faucet.local.pendingUsageReports().length);

await faucet.local.flushUsageReports();
```

The queue is process-local and intentionally does not persist sensitive prompt
content. Usage reports contain request ID, app ID, hashed user ID, route mode,
provider, model, token counts, and timestamp.

