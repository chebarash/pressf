import { defineConfig, devices } from "@playwright/test";

const database = process.env.TEST_DATABASE_URL ?? "postgres://pressf@127.0.0.1:5544/pressf_test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  // The dev server compiles each page on its first visit.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:3123", trace: "retain-on-failure", navigationTimeout: 90_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run db:seed:test && npx next dev -p 3123",
    url: "http://localhost:3123/api/health",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { DATABASE_URL: database, DEV_LOGIN_EMAIL: "student@newuu.uz", ADMIN_EMAILS: "student@newuu.uz", NEXTAUTH_SECRET: "test", NEXTAUTH_URL: "http://localhost:3123" },
  },
});
