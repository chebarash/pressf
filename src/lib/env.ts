import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string(),
  NEXTAUTH_URL: z.string().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  ADMIN_EMAILS: z.string().default(""),
  BOT_API_URL: z.string().optional(),
  BOT_API_TOKEN: z.string().optional(),
  /** Off until the bot's export stops blocking its event loop. */
  MENTIONS_SYNC: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  TELEGRAM_FILES_BOT_TOKEN: z.string().default(""),
  TELEGRAM_FILES_WEBHOOK_SECRET: z.string().default(""),
  TELEGRAM_FILES_REVIEW_CHAT_ID: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Local only: signs every request in as this email, without Google. */
  DEV_LOGIN_EMAIL: z.string().optional(),
});

let cached: z.infer<typeof schema> | undefined;

export function env() {
  cached ??= schema.parse(
    Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""))
  );
  return cached;
}

export const STUDENT_DOMAIN = "newuu.uz";

export const isAdminEmail = (email?: string | null) =>
  !!email &&
  env()
    .ADMIN_EMAILS.split(",")
    .map((item) => item.trim().toLowerCase())
    .includes(email.toLowerCase());
