import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyInitData } from "@/lib/telegram/webapp";

export const metadata = { title: "Telegram linked", robots: { index: false } };
type Props = { searchParams: Promise<{ tg?: string }> };

export default async function TelegramLinked({ searchParams }: Props) {
  const { tg = "" } = await searchParams;
  const user = await getUser();
  if (!user) redirect(`/sign-in?tg=${encodeURIComponent(tg)}`);
  const telegramId = verifyInitData(tg, 3600);
  if (telegramId) {
    await db().update(users).set({ telegramId: null }).where(eq(users.telegramId, telegramId));
    await db().update(users).set({ telegramId }).where(eq(users.id, user.id));
  }
  return (
    <div className="wrap section" style={{ justifyItems: "center", textAlign: "center", maxWidth: 520 }}>
      <h1 className="d-md">{telegramId ? "You are in" : "That link expired"}</h1>
      <p className="soft">{telegramId ? "Go back to Telegram. Press F now knows you there too." : "Open Press F in Telegram and try signing in again."}</p>
      <a className="key btn primary" href="https://t.me/pupressfbot">Back to Telegram</a>
    </div>
  );
}
