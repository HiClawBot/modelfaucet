import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashSessionToken(sessionToken: string): string {
  return `sha256:${sha256Hex(sessionToken)}`;
}

export function createGatewayRequestId(): `req_${string}` {
  return `req_${randomBytes(16).toString("base64url")}`;
}

