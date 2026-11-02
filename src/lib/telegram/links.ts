import { env } from "@/lib/env";
import { startParam } from "./start";

const BOT = "https://t.me/pressfapp";
const site = () => env().NEXTAUTH_URL.replace(/\/$/, "");

/**
 * The link an inline message can carry, since it cannot hold web app buttons.
 * `startapp` opens the app directly but needs the Main Mini App set in BotFather.
 * Without it the link opens the bot, which answers with a button to the page.
 */
export function deepLink(path: string, hasMainApp: boolean) {
  const param = startParam(path);
  if (hasMainApp) return param ? `${BOT}?startapp=${param}` : `${BOT}?startapp`;
  return param ? `${BOT}?start=${param}` : BOT;
}

/** Opens the mini app in place. Telegram allows these buttons in private chats only. */
export const appButton = (text: string, path = "") => ({ text, web_app: { url: `${site()}${path}` } });
