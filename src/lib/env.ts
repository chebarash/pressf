import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string(),
  NEXTAUTH_URL: z.string().default("http://localhost:3000"),
  ADMIN_EMAILS: z.string().default(""),
  /** The Anonymous channel bot's API: the source of the posts that mention courses and professors. */
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
  /** The Press F bot (@pressfapp). */
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** NewUU LMS the site wraps; defaults to the live API in the client. */
  LMS_API_URL: z.string().optional(),
  /** Seals stored LMS passwords (AES-256-GCM). Keep it off the database host. */
  CREDENTIAL_KEY: z.string().optional(),
  /** Local only: signs every request in as this email, without the LMS. */
  DEV_LOGIN_EMAIL: z.string().optional(),
});

let cached: z.infer<typeof schema> | undefined;

export function env() {
  if (cached) return cached;
  const set = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));
  cached = schema.parse(set);
  return cached;
}

export const STUDENT_DOMAIN = "newuu.uz";

export const isAdminEmail = (email?: string | null) =>
  !!email &&
  env()
    .ADMIN_EMAILS.split(",")
    .map((item) => item.trim().toLowerCase())
    .includes(email.toLowerCase());
