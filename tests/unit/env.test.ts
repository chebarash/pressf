import { afterEach, describe, expect, it, vi } from "vitest";

const load = async () => {
  vi.resetModules();
  return (await import("@/lib/env")).env();
};

afterEach(() => vi.unstubAllEnvs());

describe("bot env names", () => {
  it("reads the new names", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "new-token");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "new-secret");
    expect(await load()).toMatchObject({ TELEGRAM_BOT_TOKEN: "new-token", TELEGRAM_WEBHOOK_SECRET: "new-secret" });
  });
  it("falls back to the old TELEGRAM_FILES_* names", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    vi.stubEnv("TELEGRAM_FILES_BOT_TOKEN", "old-token");
    vi.stubEnv("TELEGRAM_FILES_WEBHOOK_SECRET", "old-secret");
    expect(await load()).toMatchObject({ TELEGRAM_BOT_TOKEN: "old-token", TELEGRAM_WEBHOOK_SECRET: "old-secret" });
  });
});
