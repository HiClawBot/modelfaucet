// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FaucetChat,
  FaucetFeatureCommand,
  FaucetProvider,
  FaucetUsage,
  reactPackage
} from "../src/index";
import type { FaucetClient } from "@modelfaucet/sdk";

function testClient(
  chat: FaucetClient["chat"],
  runFeature: FaucetClient["runFeature"] = vi.fn()
): FaucetClient {
  return {
    createSession: vi.fn(),
    chat,
    runFeature,
    local: {
      detectBridge: vi.fn(),
      listModels: vi.fn(),
      diagnose: vi.fn(),
      pendingUsageReports: vi.fn(() => []),
      flushUsageReports: vi.fn()
    }
  };
}

afterEach(() => {
  cleanup();
});

describe("FaucetChat", () => {
  it("sends a prompt and renders the response", async () => {
    const chat = vi.fn<FaucetClient["chat"]>().mockResolvedValue({
      choices: [{ message: { content: "Generated customer reply" } }]
    });

    render(
      <FaucetProvider
        client={testClient(chat)}
        publicAppId="app_pub_demo"
        userId="demo-user"
      >
        <FaucetChat feature="customer_reply" submitLabel="Generate Reply" />
      </FaucetProvider>
    );

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Customer needs help with billing." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Reply" }));

    await waitFor(() => {
      expect(screen.getByText("Generated customer reply")).toBeTruthy();
    });
    expect(chat).toHaveBeenCalledWith({
      feature: "customer_reply",
      input: "Customer needs help with billing.",
      model: undefined
    });
  });

  it("displays chat errors", async () => {
    const chat = vi
      .fn<FaucetClient["chat"]>()
      .mockRejectedValue(new Error("Session expired"));

    render(
      <FaucetProvider
        client={testClient(chat)}
        publicAppId="app_pub_demo"
        userId="demo-user"
      >
        <FaucetChat feature="customer_reply" />
      </FaucetProvider>
    );

    fireEvent.change(screen.getByLabelText("Prompt"), {
      target: { value: "Draft a reply." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Session expired");
    });
  });

  it("keeps BYOK markup explicit by default", () => {
    expect(reactPackage.hiddenByokMarkup).toBe(false);
  });

  it("runs command-style feature calls and renders usage", async () => {
    const runFeature = vi.fn<FaucetClient["runFeature"]>().mockResolvedValue({
      text: "Escalate to retention queue.",
      raw: {
        model: "auto-text",
        choices: [{ message: { content: "Escalate to retention queue." } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        modelfaucet: { request_id: "req_command", route_mode: "platform" }
      },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      modelfaucet: { request_id: "req_command", route_mode: "platform" }
    });

    render(
      <FaucetProvider
        client={testClient(vi.fn(), runFeature)}
        publicAppId="app_pub_demo"
        userId="demo-user"
      >
        <FaucetFeatureCommand
          feature="support_action"
          initialInput='{"ticket":"refund request"}'
          submitLabel="Run action"
        />
      </FaucetProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Run action" }));

    await waitFor(() => {
      expect(screen.getByText("Escalate to retention queue.")).toBeTruthy();
    });
    expect(screen.getByLabelText("ModelFaucet usage")).toBeTruthy();
    expect(screen.getByText("req_command")).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
    expect(runFeature).toHaveBeenCalledWith({
      feature: "support_action",
      input: { ticket: "refund request" },
      model: undefined,
      routeMode: undefined
    });
  });

  it("shows command input validation errors", async () => {
    render(
      <FaucetProvider
        client={testClient(vi.fn(), vi.fn())}
        publicAppId="app_pub_demo"
        userId="demo-user"
      >
        <FaucetFeatureCommand feature="support_action" initialInput="{invalid" />
      </FaucetProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  it("renders local usage report status", () => {
    render(
      <FaucetUsage
        result={{
          model: "qwen2.5:7b",
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
          modelfaucet: {
            request_id: "req_local",
            route_mode: "local",
            usage_report_status: "queued"
          }
        }}
      />
    );

    expect(screen.getByLabelText("ModelFaucet usage")).toBeTruthy();
    expect(screen.getByText("queued")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
  });
});
