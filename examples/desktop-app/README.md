# Desktop App Integration

Desktop apps can use platform routes, explicit BYOK server endpoints, or local
model routes through the loopback Local Bridge.

```ts
import { createFaucet } from "@modelfaucet/sdk";

const faucet = createFaucet({
  publicAppId: "app_pub_demo",
  user: { id: "desktop-user-id" },
  localBridgeBaseUrl: "http://127.0.0.1:8787"
});

export async function runLocalRewrite(draft: string) {
  const diagnostics = await faucet.local.diagnose();
  if (!diagnostics.available || diagnostics.problems.length > 0) {
    throw new Error("Local Bridge is not ready.");
  }

  return faucet.runFeature({
    feature: "rewrite_reply",
    routeMode: "local",
    model: "ollama:qwen2.5:7b",
    input: { draft }
  });
}
```

The Local Bridge remains loopback-bound by default. Cloud ModelFaucet services
must not fetch desktop localhost or private LAN URLs directly.

