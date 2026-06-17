import { createDecipheriv, createHash } from "node:crypto";

function encryptionKey(secretEncryptionKey: string): Buffer {
  return createHash("sha256").update(secretEncryptionKey).digest();
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
