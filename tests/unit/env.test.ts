import { afterEach, describe, expect, it, vi } from "vitest";

const load = async () => {
  vi.resetModules();
  return (await import("@/lib/env")).env();
};

afterEach(() => vi.unstubAllEnvs());

describe("bot env names", () => {
  it("reads the bot token and webhook secret", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "new-token");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "new-secret");
    expect(await load()).toMatchObject({ TELEGRAM_BOT_TOKEN: "new-token", TELEGRAM_WEBHOOK_SECRET: "new-secret" });
  });
});
