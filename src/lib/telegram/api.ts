import { env } from "@/lib/env";

export type InlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string; switch_inline_query_current_chat?: string }>>;
};

type TelegramDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramMessage = {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  document?: TelegramDocument;
  photo?: unknown[];
  reply_to_message?: { message_id: number };
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    data?: string;
    message?: TelegramMessage;
  };
  inline_query?: { id: string; query: string; offset: string };
};

const url = (method: string) =>
  `https://api.telegram.org/bot${env().TELEGRAM_FILES_BOT_TOKEN}/${method}`;

async function parse<T>(response: Response, method: string): Promise<T> {
  const body = await response.json();
  if (!body.ok) {
    throw new Error(`Telegram ${method} failed: ${body.description}`);
  }
  return body.result as T;
}

async function call<T>(method: string, payload: object): Promise<T> {
  const response = await fetch(url(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parse<T>(response, method);
}

export const sendMessage = (chatId: number | string, text: string, replyMarkup?: InlineKeyboard) =>
  call<TelegramMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: replyMarkup,
  });

export const sendPhoto = (chatId: number | string, photo: string, caption: string, replyMarkup?: InlineKeyboard) =>
  call<TelegramMessage>("sendPhoto", { chat_id: chatId, photo, caption, parse_mode: "HTML", reply_markup: replyMarkup });

export const answerInlineQuery = (id: string, results: object[], nextOffset: string, site: string) =>
  call<boolean>("answerInlineQuery", {
    inline_query_id: id,
    results,
    next_offset: nextOffset,
    cache_time: 300,
    button: { text: "Open Press F", web_app: { url: site } },
  });

export const answerCallback = (id: string, text?: string) =>
  call<boolean>("answerCallbackQuery", {
    callback_query_id: id,
    text,
    show_alert: !!text,
  });

export const editCaption = (
  chatId: number | string,
  messageId: number,
  caption: string,
  replyMarkup?: InlineKeyboard
) =>
  call<TelegramMessage>("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: "HTML",
    reply_markup: replyMarkup ?? { inline_keyboard: [] },
  });

/** Takes a Telegram file_id, or a local file as a Blob for one-off imports. */
export async function sendDocument(
  chatId: number | string,
  document: string | { blob: Blob; fileName: string },
  caption: string,
  replyMarkup: InlineKeyboard
): Promise<TelegramMessage> {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", caption);
  form.set("parse_mode", "HTML");
  form.set("reply_markup", JSON.stringify(replyMarkup));
  if (typeof document === "string") form.set("document", document);
  else form.set("document", document.blob, document.fileName);

  const response = await fetch(url("sendDocument"), {
    method: "POST",
    body: form,
  });
  return parse<TelegramMessage>(response, "sendDocument");
}

/** Bot API only serves files up to 20 MB; bigger ones fail at getFile. */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const { file_path } = await call<{ file_path: string }>("getFile", {
    file_id: fileId,
  });
  const response = await fetch(
    `https://api.telegram.org/file/bot${env().TELEGRAM_FILES_BOT_TOKEN}/${file_path}`
  );
  if (!response.ok) {
    // The URL holds the bot token, so it must not end up in the error or logs.
    throw new Error(`Telegram file download failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
