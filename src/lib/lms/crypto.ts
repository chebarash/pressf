import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Student LMS passwords are stored so the server can log in again when the 72h
 * token expires. They are sealed with AES-256-GCM under a key that lives only in
 * an env var (CREDENTIAL_KEY), separate from the database: a database leak alone
 * reveals no passwords. The sealed form is `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 */

const VERSION = "v1";

let keyCache: Buffer | undefined;

function key(): Buffer {
  if (keyCache) return keyCache;
  const secret = env().CREDENTIAL_KEY;
  if (!secret) throw new Error("CREDENTIAL_KEY is not set");
  // A passphrase of any length is stretched to 32 bytes; a fixed salt is fine
  // because the secret is already high-entropy and never rotates per-record.
  keyCache = scryptSync(secret, "pressf.lms.credential", 32);
  return keyCache;
}

const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, b64(iv), b64(tag), b64(body)].join(".");
}

export function open(sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Bad sealed value");
  const decipher = createDecipheriv("aes-256-gcm", key(), unb64(iv));
  decipher.setAuthTag(unb64(tag));
  return Buffer.concat([decipher.update(unb64(body)), decipher.final()]).toString("utf8");
}

/** True once a CREDENTIAL_KEY is configured, so callers can degrade gracefully. */
export const canSeal = () => !!env().CREDENTIAL_KEY;
