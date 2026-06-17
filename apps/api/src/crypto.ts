import { createHash, randomBytes } from "node:crypto";

const HASH_PREFIX = "sha256:";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashExternalUserId(externalUserId: string): string {
  return `${HASH_PREFIX}${sha256Hex(externalUserId)}`;
}

export function hashSessionToken(sessionToken: string): string {
  return `${HASH_PREFIX}${sha256Hex(sessionToken)}`;
}

export function createSessionToken(): `mf_sess_${string}` {
  return `mf_sess_${randomBytes(32).toString("base64url")}`;
}

