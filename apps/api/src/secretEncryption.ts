import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ModelFaucetError } from "@modelfaucet/shared";

const SUPPORTED_PROVIDER_PREFIXES = new Map<string, string[]>([
  ["openai", ["sk-"]],
  ["openrouter", ["sk-or-", "sk-"]],
  ["anthropic", ["sk-ant-"]],
  ["gemini", ["AI"]],
  ["google", ["AI"]],
  ["azure_openai", [""]],
  ["openai_compatible", [""]]
]);

function encryptionKey(secretEncryptionKey: string): Buffer {
  return createHash("sha256").update(secretEncryptionKey).digest();
}

export function encryptSecret(rawSecret: string, secretEncryptionKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secretEncryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(rawSecret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "mfenc",
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(":");
}

export function decryptSecret(encryptedSecret: string, secretEncryptionKey: string): string {
  const [prefix, version, ivText, tagText, ciphertextText] = encryptedSecret.split(":");
  if (
    prefix !== "mfenc" ||
    version !== "v1" ||
    ivText === undefined ||
    tagText === undefined ||
    ciphertextText === undefined
  ) {
    throw new Error("Unsupported encrypted secret format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secretEncryptionKey),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function maskSecret(rawSecret: string): string {
  const visiblePrefix = rawSecret.startsWith("sk-") ? "sk-" : rawSecret.slice(0, 3);
  const suffix = rawSecret.slice(-4);
  return `${visiblePrefix}...${suffix}`;
}

export function validateBasicProviderKey(provider: string, rawSecret: string): void {
  const normalizedProvider = provider.toLowerCase();
  const prefixes = SUPPORTED_PROVIDER_PREFIXES.get(normalizedProvider);

  if (prefixes === undefined) {
    throw new ModelFaucetError({
      code: "secret_validation_failed",
      message: "Unsupported BYOK provider.",
      statusCode: 400
    });
  }

  if (rawSecret.trim() !== rawSecret || rawSecret.length < 8) {
    throw new ModelFaucetError({
      code: "secret_validation_failed",
      message: "Provider key failed basic validation.",
      statusCode: 400
    });
  }

  if (prefixes.some((prefix) => rawSecret.startsWith(prefix))) {
    return;
  }

  throw new ModelFaucetError({
    code: "secret_validation_failed",
    message: "Provider key prefix does not match the selected provider.",
    statusCode: 400
  });
}
