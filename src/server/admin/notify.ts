import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendMessage } from "@/lib/telegram/api";

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A plain message from the admin to one student or to the admin themself (broadcast test). */
export async function messageUserHook(userId: string, text: string) {
  const [row] = await db().select({ chat: users.telegramId }).from(users).where(eq(users.id, userId));
  if (!row?.chat) return false;
  try {
    await sendMessage(row.chat, esc(text));
    return true;
  } catch {
    return false;
  }
}
