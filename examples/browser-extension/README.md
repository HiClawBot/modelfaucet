# Browser Extension Integration

This example note shows the intended ModelFaucet browser-extension boundary.

```ts
import { createFaucet } from "@modelfaucet/sdk";

export const faucet = createFaucet({
  publicAppId: "app_pub_demo",
  user: { id: "extension-user-id" },
  baseUrl: "https://api.example.com",
  gatewayBaseUrl: "https://gateway.example.com/v1"
});

export async function summarizeSelection(text: string) {
  return faucet.runFeature({
    feature: "selection_summary",
    input: { text }
  });
}
```

Do not place provider API keys in extension source, extension storage, or bundled
configuration. Browser extensions should use ModelFaucet sessions, explicit BYOK
server endpoints, or the loopback Local Bridge for local models.

