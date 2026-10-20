/**
 * Cifra a `apiKey` da subconta Asaas do professor antes de gravar (AES-256-GCM). A chave vem do
 * secret `PROFESSOR_SECRETS_KEY` (qualquer texto longo; vira 32 bytes por SHA-256). Sem ele a
 * function recusa gravar — nunca cai para texto puro.
 */
import {createCipheriv, createDecipheriv, createHash, randomBytes} from "node:crypto";
import {defineSecret} from "firebase-functions/params";

export const PROFESSOR_SECRETS_KEY = defineSecret("PROFESSOR_SECRETS_KEY");

function keyOf(secret: string): Buffer {
  if (secret.trim().length < 16) throw new Error("PROFESSOR_SECRETS_KEY_MISSING");
  return createHash("sha256").update(secret.trim()).digest();
}

/** `v1.{iv}.{tag}.{dados}` em base64url. */
export function sealSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function openSecret(sealed: string, secret: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || data == null) throw new Error("PROFESSOR_SECRET_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
