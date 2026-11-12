import { addDays, localDay, shortDate, weekdayName } from "@/core/time";
import type { Deadline } from "@/core/deadlines";
import { deleteMessage, editWidgetData, pinMessage, sendWidget, unpinMessage } from "@/lib/telegram/api";
import { openButton } from "@/lib/telegram/messages";
import { WIDGET_HEIGHT, WIDGET_HTML, WIDGET_VERSION, widgetData } from "@/lib/telegram/widget";
import { saveSnapshot, snapshot } from "@/server/feed";
import type { ClassView } from "@/server/views/classes";
import type { LessonInfo } from "@/server/views/lessons";
import type { Recipient } from "./deliver";

/**
 * Keeps the pinned "Today" widget in the chat with the bot current: sent once
 * (in the morning, so it never arrives at night), then only its data is
 * edited when the classes or deadlines it shows change. A chat where Telegram
 * refuses widgets is retried a day later.
 */

const KEY = "widget";
const RETRY_MS = 86_400_000;

type State = { v: number; messageId: number | null; data: string | null; failedAt?: string };

/** The day the widget shows: today while a class is left, else the next day with classes. */
export function widgetDay(classes: ClassView[], now: Date): { day: string; label: string; classes: ClassView[] } | null {
  const today = localDay(now);
  for (let i = 0; i < 7; i++) {
    const day = addDays(today, i);
    const list = classes.filter((c) => localDay(new Date(c.start)) === day);
    if (!list.length) continue;
    if (i === 0 && !list.some((c) => Date.parse(c.end) > now.getTime())) continue;
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${weekdayName(day).slice(0, 3)} ${shortDate(day)}`;
    return { day, label, classes: list.sort((a, b) => a.start.localeCompare(b.start)) };
  }
  return null;
}

export async function syncWidget(a: {
  to: Recipient;
  classes: ClassView[];
  infos: Map<string, LessonInfo>;
  work: Deadline[];
  now: Date;
  /** Whether a new widget may be sent now (the digest window); edits go out any time. */
  maySend: boolean;
}) {
  const { to, now } = a;
  if (!to.telegramId || to.alerts.digest === false) return;
  const state = (await snapshot<State>(to.userId, KEY)) ?? { v: 0, messageId: null, data: null };
  if (state.failedAt && now.getTime() - Date.parse(state.failedAt) < RETRY_MS) return;

  const shown = widgetDay(a.classes, now);
  const data = widgetData({
    label: shown?.label ?? "Today",
    classes: (shown?.classes ?? []).map((c) => {
      const info = a.infos.get(c.key);
      return { start: c.start, end: c.end, name: c.name, room: c.room, topic: info?.title ?? info?.syllabus?.replace(/^Week \d+ · /, "") ?? null };
    }),
    due: a.work.filter((d) => d.due > now && d.due.getTime() - now.getTime() < 2 * 86_400_000).sort((x, y) => x.due.getTime() - y.due.getTime()).map((d) => ({ at: d.due, title: d.title, course: d.course })),
  });

  if (state.messageId && state.v === WIDGET_VERSION) {
    if (state.data === data) return;
    try {
      await editWidgetData(to.telegramId, state.messageId, data);
      await saveSnapshot(to.userId, KEY, { ...state, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Deleted by the student (or too old to edit): send a fresh one next morning.
      if (/not found|can't be edited|MESSAGE_ID_INVALID/i.test(message)) await saveSnapshot(to.userId, KEY, { ...state, messageId: null });
      else if (!/not modified/i.test(message)) console.error("Widget edit failed", message);
    }
    return;
  }

  if (!a.maySend) return;
  const keyboard = { inline_keyboard: [[openButton("Open Today", { to: "today" })]] };
  try {
    const sent = await sendWidget(to.telegramId, { html: WIDGET_HTML, chatData: data, height: WIDGET_HEIGHT, keyboard }).catch(() =>
      // Should Telegram refuse the Mini App button on a widget, send it bare.
      sendWidget(to.telegramId!, { html: WIDGET_HTML, chatData: data, height: WIDGET_HEIGHT }),
    );
    if (state.messageId) {
      await unpinMessage(to.telegramId, state.messageId).catch(() => undefined);
      await deleteMessage(to.telegramId, state.messageId).catch(() => undefined);
    }
    await pinMessage(to.telegramId, sent.message_id).catch(() => undefined);
    await saveSnapshot(to.userId, KEY, { v: WIDGET_VERSION, messageId: sent.message_id, data } satisfies State);
  } catch (error) {
    console.error("Widget send failed", error instanceof Error ? error.message : error);
    await saveSnapshot(to.userId, KEY, { ...state, failedAt: now.toISOString() });
  }
}
