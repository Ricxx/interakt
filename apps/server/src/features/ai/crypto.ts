import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../env.js";

// Encrypt the org's BYO API key at rest (AES-256-GCM). The key is derived from SESSION_SECRET, so the
// ciphertext is useless without the deployment's secret. Format: base64(iv).base64(tag).base64(cipher).
const key = createHash("sha256").update(`ai-key:${env.sessionSecret}`).digest();

export function encryptKey(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

export function decryptKey(blob: string): string | null {
  try {
    const [iv, tag, data] = blob.split(".");
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
