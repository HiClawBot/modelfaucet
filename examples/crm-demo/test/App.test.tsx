// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, readUsageMetadata } from "../src/App";
import { crmDemo } from "../src/index";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CRM demo", () => {
  it("uses the seeded demo app identifiers", () => {
    expect(crmDemo.publicAppId).toBe("app_pub_demo");
    expect(crmDemo.featureKey).toBe("customer_reply");
    expect(crmDemo.demoUserId).toBe("crm-demo-user");
  });

  it("generates a reply through the SDK and displays usage metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          session_token: "mf_sess_demo",
          expires_in: 900,
          gateway_base_url: "http://localhost:3002/v1",
          wallet_balance_usd: "10.00000000",
          available_modes: ["platform"]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "chatcmpl_mf_req_123",
          object: "chat.completion",
          created: 1,
          model: "auto-text",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "I checked the duplicate charge and confirmed the authorization was voided."
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 42,
            completion_tokens: 18,
            total_tokens: 60
          },
          modelfaucet: {
            request_id: "req_123",
            route_mode: "platform",
            feature_key: "customer_reply",
            estimated_price_usd: "0.00013000"
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Generate Reply" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "I checked the duplicate charge and confirmed the authorization was voided."
        )
      ).toBeTruthy();
    });
    expect(screen.getByText("req_123")).toBeTruthy();
    expect(screen.getByText("auto-text")).toBeTruthy();
    expect(screen.getByText("60")).toBeTruthy();

    const sessionCall = fetchMock.mock.calls[0];
    expect(sessionCall?.[1]?.body).toBe(
      JSON.stringify({
        public_app_id: "app_pub_demo",
        external_user_id: "crm-demo-user",
        feature_key: "customer_reply",
        metadata: {
          source: "crm-demo"
        }
      })
    );
  });

  it("displays gateway errors", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          session_token: "mf_sess_demo",
          expires_in: 900,
          gateway_base_url: "http://localhost:3002/v1",
          wallet_balance_usd: "10.00000000",
          available_modes: ["platform"]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "provider_error",
              message: "The gateway request could not be processed."
            }
          },
          500
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Generate Reply" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "ModelFaucet request failed with status 500"
      );
    });
  });

  it("extracts usage metadata from API responses", () => {
    expect(
      readUsageMetadata({
        model: "auto-text",
        usage: {
          prompt_tokens: 2,
          completion_tokens: 3,
          total_tokens: 5
        },
        modelfaucet: {
          request_id: "req_abc",
          route_mode: "platform",
          estimated_price_usd: "0.00010000"
        }
      })
    ).toEqual({
      requestId: "req_abc",
      model: "auto-text",
      routeMode: "platform",
      promptTokens: 2,
      completionTokens: 3,
      totalTokens: 5,
      estimatedPriceUsd: "0.00010000"
    });
  });
});
