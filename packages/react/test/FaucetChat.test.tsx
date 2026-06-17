// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FaucetChat, FaucetProvider, reactPackage } from "../src/index";
import type { FaucetClient } from "@modelfaucet/sdk";

function testClient(chat: FaucetClient["chat"]): FaucetClient {
  return {
    createSession: vi.fn(),
    chat,
    local: {
      detectBridge: vi.fn(),
      listModels: vi.fn()
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
});
