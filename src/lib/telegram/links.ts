import { env } from "@/lib/env";

const BOT = "https://t.me/pupressfbot";
const site = () => env().NEXTAUTH_URL.replace(/\/$/, "");

/** What `startapp` carries for a page. Telegram allows only letters, digits, _ and -. */
export function startParam(path: string) {
  const [, kind, id, hash] = decodeURIComponent(path).match(/^\/(courses|professors|files)\/([\w-]+)(#files)?$/) ?? [];
  if (!kind) return "";
  if (kind === "courses") return `${hash ? "files" : "course"}_${id}`;
  return `${kind === "professors" ? "professor" : "file"}_${id}`;
}

/** Opens the mini app on a page. The only link inline messages can carry, since they cannot hold web app buttons. */
export function deepLink(path = "") {
  const param = startParam(path);
  return param ? `${BOT}?startapp=${param}` : `${BOT}?startapp`;
}

/** Opens the mini app in place. Telegram allows these buttons in private chats only. */
export const appButton = (text: string, path = "") => ({ text, web_app: { url: `${site()}${path}` } });
