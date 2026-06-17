# SDK 和 Local Bridge

ModelFaucet `0.5.0` 把 SDK 和 Local Bridge 工作流推进到源码 beta 形态，面向真实应用开发者使用。

## Semver 策略

在 `1.0.0` 之前，SDK 公开 API 仍属于 source-beta：

- Patch release 保持已导出的类型和方法名兼容。
- Minor release 可以增加可选字段和新的 helper 方法。
- 移除或破坏性变更应等到 major version，或在 changelog 中明确说明。
- Provider API key 不是 SDK option。浏览器和桌面客户端只使用 public app ID、短期 session、BYOK server endpoint，或 loopback Local Bridge。

## Session 和 chat

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

如果应用希望用任务式 command，而不是直接处理 OpenAI-compatible 原始 payload，可以使用 `runFeature`。

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

`FaucetFeatureCommand` 会渲染标准化后的结果文本，并通过 `FaucetUsage`
展示 request ID、route mode、model、tokens，以及可用时的本地 usage-report 状态。

## Local Bridge diagnostics

Local Bridge 默认只绑定 loopback：

```bash
modelfaucet-bridge start --port 8787
```

Bridge 暴露：

```txt
GET  /health
GET  /diagnostics
GET  /models
POST /v1/chat/completions
POST /usage/report
```

`/diagnostics` 会报告 loopback 绑定和本地 upstream 可达性，但不会返回 upstream API key。

SDK 可以诊断本地链路：

```ts
const diagnostics = await faucet.local.diagnose();

if (!diagnostics.available || diagnostics.problems.length > 0) {
  console.warn(diagnostics.problems);
}
```

## 离线本地 usage reporting

即使 usage reporting 暂时不可用，本地模型调用也会返回结果。SDK 会把失败的本地 usage report 暂存在内存队列中，应用稍后可以手动 flush：

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

这个队列只存在于当前进程，并且不会持久化敏感 prompt 内容。Usage report 只包含 request ID、app ID、哈希后的 user ID、route mode、provider、model、token counts 和时间戳。

