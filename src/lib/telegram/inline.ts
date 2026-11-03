import { miniAppUrl, parseStartParam, SITE_URL, startParam, webUrl, type Target } from "@/core/links";
import { db } from "@/lib/db";
import { searchEvents } from "@/lib/db/schema";
import { appCard, courseCard, fileCard, professorCard, type ShareCard } from "@/server/og";
import { search } from "@/server/views/search";
import { answerInlineQuery, type InlineArticle, type TelegramChosenInlineResult, type TelegramInlineQuery } from "./api";
import { esc } from "./html";
import { linkedUser } from "./session";

/**
 * Inline mode: "@pressfapp c_MATH111" (what the Mini App's Share buttons type
 * through switchInlineQuery on clients older than Bot API 8.0; newer ones send
 * the same card as a prepared message, see shareResult and
 * /api/telegram/share), "f_<id>", "p_<id>", or any text, which searches
 * courses, professors and (for linked students) files. Each result is a card
 * with the share image; the sent message carries the page's link preview and a
 * button that opens the Mini App on that page. When someone sends a result,
 * Telegram reports it (chosen_inline_result) and the share is counted.
 */

const MAX_RESULTS = 10;

/** Entities a result id can name; the id is the start param ("c_MATH111"), so a chosen result says what was shared. */
export type ShareKind = "course" | "file" | "professor" | "app";

export function shareKind(t: Target): ShareKind | null {
  if (t.to === "course") return "course";
  if (t.to === "file") return "file";
  if (t.to === "professor") return "professor";
  if (t.to === "today") return "app";
  return null;
}

const absolute = (p: string) => (/^https?:\/\//.test(p) ? p : `${SITE_URL}${p}`);

/** One inline result from a share card. */
export function article(target: Target, card: ShareCard, opts: { title?: string; description?: string } = {}): InlineArticle {
  const page = card.path === "/" ? SITE_URL : webUrl(target);
  return {
    type: "article",
    // The start param names the entity ("c_MATH111", ≤ 64 bytes), so a chosen result says what was shared.
    id: startParam(target).slice(0, 64),
    title: opts.title ?? card.title.replace(/ — Press F$/, ""),
    description: opts.description ?? card.description,
    thumbnail_url: absolute(card.image),
    thumbnail_width: 1200,
    thumbnail_height: 630,
    input_message_content: {
      message_text: `<b>${esc(card.title.replace(/ — Press F$/, ""))}</b>\n${esc(card.description)}`,
      parse_mode: "HTML",
      // The page's own preview (og:image is the share card), large and above the text.
      link_preview_options: { url: page, prefer_large_media: true, show_above_text: true },
    },
    // Inline messages can't carry web_app buttons; the startapp link opens the Mini App on the page.
    reply_markup: { inline_keyboard: [[{ text: "Open in Press F", url: miniAppUrl(target) }]] },
  };
}

async function cardFor(t: Target): Promise<ShareCard | null> {
  if (t.to === "course") return courseCard(t.code);
  if (t.to === "professor") return professorCard(t.id);
  if (t.to === "file") return fileCard(t.id);
  return null;
}

/** "c_MATH111", "p_123", "f_456": a share request from a Share button. */
const SHARE_CODE = /^[cpf]_[A-Za-z0-9_-]+$/;

/**
 * The one card a Share button sends for a course, file or professor: both the
 * inline answer to "c_MATH111" and the prepared message
 * (savePreparedInlineMessage) are built here. Null when the entity doesn't exist.
 */
export async function shareResult(target: Target): Promise<InlineArticle | null> {
  if (target.to !== "course" && target.to !== "file" && target.to !== "professor") return null;
  const card = await cardFor(target);
  return card ? article(target, card) : null;
}

export async function inlineResults(query: string, fromId: number): Promise<InlineArticle[]> {
  const q = query.trim();
  if (!q) return [article({ to: "today" }, appCard(), { title: "Press F", description: "Your NewUU timetable, files, grades — and what students say about every course." })];

  if (SHARE_CODE.test(q)) {
    const result = await shareResult(parseStartParam(q));
    if (result) return [result];
  }

  // Free text: the same ranked search as the app (files only for students who linked Telegram).
  const user = await linkedUser(fromId);
  const found = await search(q, user ? { userId: user.id } : null, { courses: 5, people: 3, files: user ? 2 : 0, programs: 0 });
  const targets: Target[] = [
    ...found.courses.map((c) => ({ to: "course" as const, code: c.code })),
    ...found.people.map((p) => ({ to: "professor" as const, id: p.id })),
    ...found.files.map((f) => ({ to: "file" as const, id: f.id })),
  ].slice(0, MAX_RESULTS);
  const cards = await Promise.all(targets.map(async (t) => ({ t, card: await cardFor(t) })));
  return cards.filter((x): x is { t: Target; card: ShareCard } => !!x.card).map((x) => article(x.t, x.card));
}

export async function handleInlineQuery(q: TelegramInlineQuery) {
  let results: InlineArticle[] = [];
  try {
    results = await inlineResults(q.query, q.from.id);
  } catch (error) {
    console.error("Inline query failed", error instanceof Error ? error.message : error);
  }
  // Free-text answers can include files for linked students, so they are per person.
  const personal = !SHARE_CODE.test(q.query.trim()) && q.query.trim().length > 0;
  return answerInlineQuery(q.id, results, { cacheTime: personal ? 30 : 300, personal });
}

/** search_events kind for a share: "share:course", "share:file", "share:professor", "share:app". */
export const shareEventKind = (k: ShareKind) => `share:${k}`;

/**
 * Counts a sent result as one share of its entity (no user id is stored): an
 * inline result (chosen_inline_result), or a prepared message the Mini App
 * reported as sent (Telegram sends no chosen_inline_result for those).
 */
export async function recordShare(chosen: Pick<TelegramChosenInlineResult, "result_id">) {
  const id = chosen.result_id;
  const target = parseStartParam(id);
  const kind = shareKind(target);
  if (!kind) return;
  const targetId = target.to === "course" ? target.code.toUpperCase() : target.to === "file" || target.to === "professor" ? target.id : "app";
  await db().insert(searchEvents).values({ kind: shareEventKind(kind), targetId });
}
