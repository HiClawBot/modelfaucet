import { FaucetProvider, useFaucet } from "@modelfaucet/react";
import { useMemo, useState, type FormEvent } from "react";
import { crmDemo } from "./index";

type UsageMetadata = {
  requestId: string;
  model: string;
  routeMode: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedPriceUsd: string;
};

const DEFAULT_TICKET = `Customer: Hi, I was charged twice for my subscription renewal.

Context: Customer is on the Pro plan. Their first payment succeeded, and the second authorization was voided by the processor.

Tone: concise, empathetic, and specific.`;

const API_BASE_URL =
  import.meta.env.VITE_MODELFAUCET_API_BASE_URL ?? "http://localhost:3001";
const GATEWAY_BASE_URL =
  import.meta.env.VITE_MODELFAUCET_GATEWAY_BASE_URL ?? "http://localhost:3002/v1";

function readChoiceText(result: Record<string, unknown>): string {
  const choices = result.choices;
  if (!Array.isArray(choices)) {
    return JSON.stringify(result, null, 2);
  }

  const firstChoice = choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null) {
    return JSON.stringify(result, null, 2);
  }

  const message = "message" in firstChoice ? firstChoice.message : undefined;
  if (typeof message === "object" && message !== null && "content" in message) {
    const content = message.content;
    if (typeof content === "string") {
      return content;
    }
  }

  return JSON.stringify(result, null, 2);
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function readUsageMetadata(result: Record<string, unknown>): UsageMetadata {
  const usage = typeof result.usage === "object" && result.usage !== null ? result.usage : {};
  const modelfaucet =
    typeof result.modelfaucet === "object" && result.modelfaucet !== null
      ? result.modelfaucet
      : {};

  return {
    requestId: readString("request_id" in modelfaucet ? modelfaucet.request_id : undefined),
    model: readString(result.model),
    routeMode: readString("route_mode" in modelfaucet ? modelfaucet.route_mode : undefined),
    promptTokens: readNumber("prompt_tokens" in usage ? usage.prompt_tokens : undefined),
    completionTokens: readNumber(
      "completion_tokens" in usage ? usage.completion_tokens : undefined
    ),
    totalTokens: readNumber("total_tokens" in usage ? usage.total_tokens : undefined),
    estimatedPriceUsd: readString(
      "estimated_price_usd" in modelfaucet ? modelfaucet.estimated_price_usd : undefined
    )
  };
}

function formatPrice(value: string): string {
  return value.length > 0 ? `$${Number(value).toFixed(6)}` : "$0.000000";
}

function ReplyComposer() {
  const faucet = useFaucet();
  const [ticket, setTicket] = useState(DEFAULT_TICKET);
  const [reply, setReply] = useState("");
  const [usage, setUsage] = useState<UsageMetadata | undefined>();
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTicket = ticket.trim();
    if (trimmedTicket.length === 0 || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setError("");

    try {
      const result = await faucet.chat({
        feature: crmDemo.featureKey,
        input: trimmedTicket
      });
      setReply(readChoiceText(result));
      setUsage(readUsageMetadata(result));
    } catch (caughtError) {
      setReply("");
      setUsage(undefined);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The reply could not be generated."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="workbench" aria-label="CRM reply composer">
        <div className="pane input-pane">
          <div className="pane-header">
            <div>
              <p className="eyebrow">CRM ticket</p>
              <h1>Customer reply</h1>
            </div>
            <span className="status-chip">ModelFaucet</span>
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <label htmlFor="ticket">Customer ticket</label>
            <textarea
              id="ticket"
              onChange={(event) => setTicket(event.currentTarget.value)}
              rows={11}
              value={ticket}
            />
            <button disabled={isGenerating || ticket.trim().length === 0} type="submit">
              {isGenerating ? "Generating..." : "Generate Reply"}
            </button>
          </form>
        </div>

        <div className="pane output-pane">
          <div className="pane-header">
            <div>
              <p className="eyebrow">Assistant draft</p>
              <h2>Reply output</h2>
            </div>
            {usage !== undefined ? (
              <span className="status-chip">{usage.routeMode || "platform"}</span>
            ) : null}
          </div>

          {error.length > 0 ? <p className="error" role="alert">{error}</p> : null}
          {reply.length > 0 ? (
            <output className="reply-output">{reply}</output>
          ) : (
            <p className="empty-state">Generated replies appear here.</p>
          )}

          <dl className="usage-grid" aria-label="Usage metadata">
            <div>
              <dt>Request</dt>
              <dd>{usage?.requestId || "pending"}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{usage?.model || "auto:customer_reply"}</dd>
            </div>
            <div>
              <dt>Input tokens</dt>
              <dd>{usage?.promptTokens ?? 0}</dd>
            </div>
            <div>
              <dt>Output tokens</dt>
              <dd>{usage?.completionTokens ?? 0}</dd>
            </div>
            <div>
              <dt>Total tokens</dt>
              <dd>{usage?.totalTokens ?? 0}</dd>
            </div>
            <div>
              <dt>Est. price</dt>
              <dd>{formatPrice(usage?.estimatedPriceUsd ?? "")}</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}

export function App() {
  const user = useMemo(
    () => ({
      id: crmDemo.demoUserId,
      metadata: {
        source: "crm-demo"
      }
    }),
    []
  );

  return (
    <FaucetProvider
      baseUrl={API_BASE_URL}
      gatewayBaseUrl={GATEWAY_BASE_URL}
      publicAppId={crmDemo.publicAppId}
      user={user}
    >
      <ReplyComposer />
    </FaucetProvider>
  );
}
