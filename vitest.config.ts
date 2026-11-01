import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/fixtures/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://pressf@127.0.0.1:5544/pressf_test",
      BOT_API_URL: "https://bot.test", BOT_API_TOKEN: "bot-token", CRON_SECRET: "cron-secret",
      ADMIN_EMAILS: "boss@newuu.uz, Second@newuu.uz", NEXTAUTH_URL: "https://pressf.test",
      TELEGRAM_FILES_BOT_TOKEN: "tg-token", TELEGRAM_FILES_WEBHOOK_SECRET: "hook-secret", TELEGRAM_FILES_REVIEW_CHAT_ID: "-100",
    },
  },
});
