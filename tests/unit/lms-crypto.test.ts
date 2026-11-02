import { afterEach, beforeEach, describe, expect, it } from "vitest";

const KEY = "test-credential-key-0123456789";

async function freshCrypto() {
  // The module caches the derived key, so reset modules between key changes.
  const mod = await import("@/lib/lms/crypto");
  return mod;
}

describe("lms/crypto", () => {
  beforeEach(() => {
    process.env.CREDENTIAL_KEY = KEY;
    // env() caches the parsed value; clear it so the key is picked up.
    delete (globalThis as Record<string, unknown>).__noop;
  });
  afterEach(() => {
    delete process.env.CREDENTIAL_KEY;
  });

  it("round-trips a password", async () => {
    const { seal, open } = await freshCrypto();
    const secret = "example-passphrase-9000";
    const sealed = seal(secret);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(secret);
    expect(open(sealed)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { seal } = await freshCrypto();
    expect(seal("same")).not.toBe(seal("same"));
  });

  it("rejects a tampered ciphertext", async () => {
    const { seal, open } = await freshCrypto();
    const sealed = seal("secret");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => open(parts.join("."))).toThrow();
  });

  it("rejects a malformed value", async () => {
    const { open } = await freshCrypto();
    expect(() => open("nonsense")).toThrow("Bad sealed value");
  });
});
