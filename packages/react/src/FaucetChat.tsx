import { useState, type FormEvent } from "react";
import { useFaucet } from "./FaucetProvider";

export type FaucetChatProps = {
  feature: string;
  model?: string;
  placeholder?: string;
  submitLabel?: string;
  initialInput?: string;
  className?: string;
};

function responseText(result: Record<string, unknown>): string {
  const choices = result.choices;
  if (Array.isArray(choices)) {
    const firstChoice = choices[0];
    if (typeof firstChoice === "object" && firstChoice !== null) {
      const message = "message" in firstChoice ? firstChoice.message : undefined;
      if (typeof message === "object" && message !== null && "content" in message) {
        const content = message.content;
        if (typeof content === "string") {
          return content;
        }
      }

      const text = "text" in firstChoice ? firstChoice.text : undefined;
      if (typeof text === "string") {
        return text;
      }
    }
  }

  return JSON.stringify(result, null, 2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "ModelFaucet request failed.";
}

export function FaucetChat({
  feature,
  model,
  placeholder = "Ask ModelFaucet...",
  submitLabel = "Send",
  initialInput = "",
  className
}: FaucetChatProps) {
  const faucet = useFaucet();
  const [input, setInput] = useState(initialInput);
  const [reply, setReply] = useState("");
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
      const result = await faucet.chat({
        feature,
        input: trimmedInput,
        model
      });
      setReply(responseText(result));
    } catch (caughtError) {
      setReply("");
      setError(errorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={className} onSubmit={handleSubmit}>
      <label>
        <span>Prompt</span>
        <textarea
          aria-label="Prompt"
          disabled={isSubmitting}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder={placeholder}
          rows={5}
          value={input}
        />
      </label>
      <button disabled={isSubmitting || input.trim().length === 0} type="submit">
        {isSubmitting ? "Sending..." : submitLabel}
      </button>
      {reply.length > 0 ? <output>{reply}</output> : null}
      {error.length > 0 ? <p role="alert">{error}</p> : null}
    </form>
  );
}
