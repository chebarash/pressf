import { env } from "@/lib/env";

/** `style` colours the button (Bot API 9.4): blue for the main action, green, red. */
export type InlineButton = { text: string; callback_data?: string; url?: string; web_app?: { url: string }; style?: "primary" | "success" | "danger" };

export type InlineKeyboard = {
  inline_keyboard: InlineButton[][];
};

export type TelegramFile = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

export type TelegramPhotoSize = { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number };

export type TelegramUser = { id: number; is_bot?: boolean; first_name?: string; username?: string };

export type TelegramMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: TelegramUser;
  text?: string;
  caption?: string;
  document?: TelegramFile;
  video?: TelegramFile;
  audio?: TelegramFile;
  photo?: TelegramPhotoSize[];
  reply_to_message?: { message_id: number };
};

export type TelegramCallbackQuery = {
  id: string;
  from?: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};

/** Someone typed "@pressfapp …" in a chat (or a Share button switched to inline mode). */
export type TelegramInlineQuery = { id: string; from: TelegramUser; query: string; offset: string; chat_type?: string };

/** The result they sent (inline feedback must be on in BotFather: /setinlinefeedback). */
export type TelegramChosenInlineResult = { result_id: string; from: TelegramUser; query: string; inline_message_id?: string };

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
  chosen_inline_result?: TelegramChosenInlineResult;
};

/**
 * Updates the webhook must ask for (setWebhook allowed_updates): messages and
 * buttons for the file intake, inline queries and chosen results for sharing.
 */
export const ALLOWED_UPDATES = ["message", "callback_query", "inline_query", "chosen_inline_result"] as const;

/** An article result: a rich card (title, description, thumbnail) that sends a message with a link preview and a button. */
export type InlineArticle = {
  type: "article";
  id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  input_message_content: {
    message_text: string;
    parse_mode?: "HTML";
    link_preview_options?: { url?: string; prefer_large_media?: boolean; show_above_text?: boolean; is_disabled?: boolean };
  };
  reply_markup?: InlineKeyboard;
};

const url = (method: string) =>
  `https://api.telegram.org/bot${env().TELEGRAM_BOT_TOKEN}/${method}`;

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

/**
 * A ready message from one of the builders in ./messages. `rich` is the same
 * message as a rich message (tables, collapsible blocks; Bot API 10.1), sent
 * instead of `text` where Telegram takes it; `effect` is a message effect id
 * (private chats only).
 */
export type BotMessage = { text: string; keyboard?: InlineKeyboard; rich?: string; effect?: string };

export const sendRichMessage = (chatId: number | string, html: string, replyMarkup?: InlineKeyboard, effect?: string) =>
  call<TelegramMessage>("sendRichMessage", { chat_id: chatId, rich_message: { html }, reply_markup: replyMarkup, message_effect_id: effect });

/** Sends the rich version when there is one, falling back to plain HTML text if Telegram refuses it. */
export async function send(chatId: number | string, message: BotMessage) {
  if (message.rich) {
    try {
      return await sendRichMessage(chatId, message.rich, message.keyboard, message.effect);
    } catch (error) {
      console.error("Rich message refused, sending text", error instanceof Error ? error.message : error);
    }
  }
  if (message.effect) {
    try {
      return await call<TelegramMessage>("sendMessage", { chat_id: chatId, text: message.text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: message.keyboard, message_effect_id: message.effect });
    } catch {
      // An unknown effect id: send it plain.
    }
  }
  return sendMessage(chatId, message.text, message.keyboard);
}

/* ───────────── widgets (Bot API 10.4; private chats only) ───────────── */

/** An HTML widget in the chat; its code is fixed, `chat_data` (≤1024 bytes) is what the bot updates. */
export const sendWidget = (chatId: number | string, a: { html: string; chatData: string; height?: number; keyboard?: InlineKeyboard }) =>
  call<TelegramMessage>("sendWidget", { chat_id: chatId, html: a.html, chat_data: a.chatData, height: a.height, reply_markup: a.keyboard, disable_notification: true });

export const editWidgetData = (chatId: number | string, messageId: number, chatData: string) =>
  call<TelegramMessage | true>("editMessageWidgetData", { chat_id: chatId, message_id: messageId, chat_data: chatData });

export const pinMessage = (chatId: number | string, messageId: number) =>
  call<boolean>("pinChatMessage", { chat_id: chatId, message_id: messageId, disable_notification: true });

export const unpinMessage = (chatId: number | string, messageId: number) => call<boolean>("unpinChatMessage", { chat_id: chatId, message_id: messageId });

export const deleteMessage = (chatId: number | string, messageId: number) => call<boolean>("deleteMessage", { chat_id: chatId, message_id: messageId });

export const editMessage = (chatId: number | string, messageId: number, text: string, replyMarkup?: InlineKeyboard) =>
  call<TelegramMessage | true>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: replyMarkup ?? { inline_keyboard: [] },
  });

export const editKeyboard = (chatId: number | string, messageId: number, replyMarkup?: InlineKeyboard) =>
  call<TelegramMessage | true>("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup ?? { inline_keyboard: [] },
  });

export const sendPhoto = (chatId: number | string, photo: string, caption: string, replyMarkup?: InlineKeyboard) =>
  call<TelegramMessage>("sendPhoto", { chat_id: chatId, photo, caption, parse_mode: "HTML", reply_markup: replyMarkup });

export const answerInlineQuery = (id: string, results: InlineArticle[], opts: { cacheTime?: number; personal?: boolean } = {}) =>
  call<boolean>("answerInlineQuery", {
    inline_query_id: id,
    results,
    cache_time: opts.cacheTime ?? 60,
    is_personal: opts.personal ?? false,
  });

/** A message a Mini App user can send with WebApp.shareMessage(id) (Bot API 8.0). */
export type PreparedInlineMessage = { id: string; expiration_date: number };

/** Stores an inline result for one user to share from the Mini App (any chat type except bots). */
export const savePreparedInlineMessage = (userId: number | string, result: InlineArticle) =>
  call<PreparedInlineMessage>("savePreparedInlineMessage", {
    user_id: Number(userId),
    result,
    allow_user_chats: true,
    allow_group_chats: true,
    allow_channel_chats: true,
  });

export const answerCallback =(id: string, text?: string, alert = !!text) =>
  call<boolean>("answerCallbackQuery", {
    callback_query_id: id,
    text,
    show_alert: alert,
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
    `https://api.telegram.org/file/bot${env().TELEGRAM_BOT_TOKEN}/${file_path}`
  );
  if (!response.ok) {
    // The URL holds the bot token, so it must not end up in the error or logs.
    throw new Error(`Telegram file download failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
