import type { FaucetChatResult } from "@modelfaucet/sdk";

export type FaucetUsageProps = {
  result?: FaucetChatResult;
  className?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function FaucetUsage({ result, className }: FaucetUsageProps) {
  if (result === undefined) {
    return null;
  }

  const usage = asRecord(result.usage);
  const modelfaucet = asRecord(result.modelfaucet);
  const promptTokens = readNumber(usage, "prompt_tokens");
  const completionTokens = readNumber(usage, "completion_tokens");
  const totalTokens = readNumber(usage, "total_tokens") || promptTokens + completionTokens;
  const requestId = readString(modelfaucet, "request_id") ?? "unreported";
  const routeMode = readString(modelfaucet, "route_mode") ?? "unknown";
  const reportStatus = readString(modelfaucet, "usage_report_status");
  const model = typeof result.model === "string" ? result.model : "auto";

  return (
    <dl className={className} aria-label="ModelFaucet usage">
      <div>
        <dt>Request</dt>
        <dd>{requestId}</dd>
      </div>
      <div>
        <dt>Route</dt>
        <dd>{routeMode}</dd>
      </div>
      <div>
        <dt>Model</dt>
        <dd>{model}</dd>
      </div>
      <div>
        <dt>Tokens</dt>
        <dd>{totalTokens}</dd>
      </div>
      {reportStatus !== undefined ? (
        <div>
          <dt>Report</dt>
          <dd>{reportStatus}</dd>
        </div>
      ) : null}
    </dl>
  );
}
