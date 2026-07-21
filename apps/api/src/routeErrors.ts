import { ModelFaucetError } from "@modelfaucet/shared";

export function toModelFaucetError(error: unknown): ModelFaucetError {
  if (error instanceof ModelFaucetError) {
    return error;
  }

  return new ModelFaucetError({
    code: "invalid_request",
    message: "The request could not be processed.",
    statusCode: 500
  });
}
