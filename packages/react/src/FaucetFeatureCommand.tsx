import { useState, type FormEvent } from "react";
import type { FaucetFeatureResult, RouteMode } from "@modelfaucet/sdk";
import { useFaucet } from "./FaucetProvider";
import { FaucetUsage } from "./FaucetUsage";

export type FaucetFeatureCommandProps = {
  feature: string;
  model?: string;
  routeMode?: RouteMode;
  initialInput?: string;
  placeholder?: string;
  submitLabel?: string;
  className?: string;
};

function parseCommandInput(value: string): string | Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) {
    return trimmed;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Command input must be a JSON object or plain text.");
  }

  return parsed as Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "ModelFaucet command failed.";
}

export function FaucetFeatureCommand({
  feature,
  model,
  routeMode,
  initialInput = "{}",
  placeholder = "{}",
  submitLabel = "Run",
  className
}: FaucetFeatureCommandProps) {
  const faucet = useFaucet();
  const [input, setInput] = useState(initialInput);
  const [result, setResult] = useState<FaucetFeatureResult | undefined>();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedInput = input.trim();
    if (trimmedInput.length === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const nextResult = await faucet.runFeature({
        feature,
        input: parseCommandInput(trimmedInput),
        model,
        routeMode
      });
      setResult(nextResult);
    } catch (caughtError) {
      setResult(undefined);
      setError(errorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={className} onSubmit={handleSubmit}>
      <label>
        <span>Command input</span>
        <textarea
          aria-label="Command input"
          disabled={isSubmitting}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder={placeholder}
          rows={6}
          value={input}
        />
      </label>
      <button disabled={isSubmitting || input.trim().length === 0} type="submit">
        {isSubmitting ? "Running..." : submitLabel}
      </button>
      {result !== undefined ? <output>{result.text}</output> : null}
      {result !== undefined ? <FaucetUsage result={result.raw} /> : null}
      {error.length > 0 ? <p role="alert">{error}</p> : null}
    </form>
  );
}
