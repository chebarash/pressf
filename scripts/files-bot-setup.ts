/**
 * Brands the Telegram bot and its review group, and points the bot at the site.
 *   npx tsx scripts/files-bot-setup.ts [https://pressf.chebarash.uz] [--pin]
 * Without a URL it updates only the look. --pin posts and pins the review guide.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";

const token = process.env.TELEGRAM_FILES_BOT_TOKEN;
const group = process.env.TELEGRAM_FILES_REVIEW_CHAT_ID;
const secret = process.env.TELEGRAM_FILES_WEBHOOK_SECRET;
const base = process.argv.slice(2).find((arg) => arg.startsWith("http"));
const pin = process.argv.includes("--pin");

const api = (method: string) => `https://api.telegram.org/bot${token}/${method}`;
const report = async (method: string, response: Response) => {
  const result = await response.json();
  console.log(method, result.ok ? "ok" : result.description);
  return result;
};

const call = async (method: string, body: object) =>
  report(method, await fetch(api(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

async function upload(method: string, fields: Record<string, string>, field: string, path: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set(field, new Blob([await readFile(path)], { type: "image/png" }), "photo.png");
  return report(method, await fetch(api(method), { method: "POST", body: form }));
}

async function main() {
  const { REVIEW_GUIDE } = await import("../src/lib/telegram/bot");

  await call("setMyName", { name: "Press F" });
  await call("setMyShortDescription", { short_description: "Send past exams and syllabi. Press F shares them with every NewUU student." });
  await call("setMyDescription", { description: "Press F to share files.\n\nSend a syllabus, past exam, mock or notes as a file. We check it and add it to the course page for every NewUU student." });
  await call("setMyCommands", { commands: [{ command: "start", description: "How to share a file" }] });
  await upload("setMyProfilePhoto", { photo: JSON.stringify({ type: "static", photo: "attach://file" }) }, "file", "public/bot/avatar.png");

  if (group) {
    await call("setChatTitle", { chat_id: group, title: "Press F · Review" });
    await call("setChatDescription", { chat_id: group, description: "Students send files to @pupressfbot. We check them here before they go on the site." });
    await upload("setChatPhoto", { chat_id: group }, "photo", "public/bot/review.png");
    await call("setMyCommands", {
      scope: { type: "chat", chat_id: group },
      commands: [
        { command: "pending", description: "Files waiting for review" },
        { command: "stats", description: "What is on the site" },
        { command: "help", description: "How review works" },
      ],
    });
    if (pin) {
      const sent = await call("sendMessage", { chat_id: group, text: REVIEW_GUIDE, parse_mode: "HTML" });
      if (sent.ok) await call("pinChatMessage", { chat_id: group, message_id: sent.result.message_id, disable_notification: true });
    }
  }

  if (base) {
    await call("setWebhook", { url: `${base.replace(/\/$/, "")}/api/telegram/files`, secret_token: secret, allowed_updates: ["message", "callback_query"] });
    await call("setChatMenuButton", { menu_button: { type: "web_app", text: "Open Press F", web_app: { url: base } } });
  }
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
