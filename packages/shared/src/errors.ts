import type { ModelFaucetErrorCode } from "./types";

export type ModelFaucetErrorResponse = {
  error: {
    code: ModelFaucetErrorCode;
    message: string;
    request_id?: string;
    details?: unknown;
  };
};

export class ModelFaucetError extends Error {
  readonly code: ModelFaucetErrorCode;
  readonly requestId?: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(input: {
    code: ModelFaucetErrorCode;
    message: string;
    requestId?: string;
    statusCode?: number;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "ModelFaucetError";
    this.code = input.code;
    this.requestId = input.requestId;
    this.statusCode = input.statusCode ?? 400;
    this.details = input.details;
  }
}

export function createErrorResponse(error: ModelFaucetError): ModelFaucetErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.requestId === undefined ? {} : { request_id: error.requestId }),
      ...(error.details === undefined ? {} : { details: error.details })
    }
  };
}

