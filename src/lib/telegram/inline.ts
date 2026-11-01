import { createHash } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { getCatalog } from "@/lib/catalog";
import type { Course, Teacher } from "@/lib/catalog";
import { faceMap, popularCourses, teacherLine } from "@/lib/content";
import { db } from "@/lib/db";
import { materials } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { courseRatings, teacherRatings, type Rating } from "@/lib/ratings";
import { search } from "@/lib/search";
import { answerInlineQuery } from "./api";

type Material = typeof materials.$inferSelect;
type InlineQuery = { id: string; query: string; offset: string };

const PAGE = 20;
const MOST = 50;
// A branded copy is a little bigger than its source, and Telegram fetches at most 20 MB by URL.
const MAX_SHARED_SIZE = 19 * 1024 * 1024;

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const site = () => env().NEXTAUTH_URL.replace(/\/$/, "");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const resultId = (kind: string, id: string) => createHash("sha1").update(`${kind}:${id}`).digest("hex");
const open = (path: string) => ({ inline_keyboard: [[{ text: "Open on Press F", url: `${site()}${path}` }]] });
const scored = (rating?: Rating) => (rating ? `${rating.overall.toFixed(1)} from ${plural(rating.count, "student")}` : null);
const lines = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join("\n");
const dots = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(" · ");

const article = (kind: string, id: string, title: string, description: string, text: string, path: string, thumbnail?: string) => ({
  type: "article", id: resultId(kind, id), title, description,
  ...(thumbnail ? { thumbnail_url: thumbnail } : {}),
  input_message_content: { message_text: text, parse_mode: "HTML", link_preview_options: { is_disabled: true } },
  reply_markup: open(path),
});

function courseResult(course: Course, rating: Rating | undefined, files: number, teachers: string[]) {
  const shown = teachers.slice(0, 3).join(", ");
  const fileLine = files ? plural(files, "file") : null;
  const text = lines(`<b>${esc(course.subject)}</b>`, course.code, scored(rating), shown ? esc(shown) : null, fileLine);
  return article("course", course.code, course.subject, dots(course.code, rating?.overall.toFixed(1), fileLine), text, `/courses/${course.code}`, `${site()}/bot/avatar.png`);
}

function teacherResult(teacher: Teacher, rating: Rating | undefined, hasFace: boolean) {
  const path = `/professors/${encodeURIComponent(teacher.id)}`;
  const line = teacherLine(teacher);
  const text = lines(`<b>${esc(teacher.display_name)}</b>`, line ? esc(line) : null, scored(rating));
  return article("teacher", teacher.id, teacher.display_name, dots(rating?.overall.toFixed(1), line), text, path, hasFace ? `${site()}/faces/${encodeURIComponent(teacher.id)}` : `${site()}/pfp.png`);
}

function fileResult(file: Material) {
  const course = [file.courseCode, file.courseName].filter(Boolean).join(" ");
  const about = dots(file.type, file.term);
  const name = file.fileName.replace(/\.pdf$/i, "");
  const text = lines(`<b>${esc(name)}</b>`, course ? esc(course) : null, about ? esc(about) : null);
  const description = dots(file.courseCode, about);
  const isPdf = file.mimeType === "application/pdf" && /\.pdf$/i.test(file.fileName);
  if (!isPdf || file.size > MAX_SHARED_SIZE) return article("file", file.id, file.fileName, description, text, `/files/${file.id}`);
  return {
    type: "document", id: resultId("file", file.id), title: file.fileName, description,
    document_url: `${site()}/files/${file.id}/${encodeURIComponent(file.fileName)}`,
    mime_type: "application/pdf", caption: text, parse_mode: "HTML",
    reply_markup: open(file.courseCode ? `/courses/${file.courseCode}#files` : "/files"),
  };
}

async function filesPerCourse() {
  const rows = await db().select({ code: materials.courseCode, value: count() }).from(materials)
    .where(eq(materials.status, "approved")).groupBy(materials.courseCode);
  return new Map(rows.map((row) => [row.code, row.value]));
}

/** Answers `@bot query` with what the site search finds, ready to send to any chat. */
export async function handleInline(query: InlineQuery) {
  const offset = Number(query.offset) || 0;
  const catalog = await getCatalog();
  const text = query.query.trim();
  const found = text
    ? await search(text, { courses: MOST, teachers: MOST, files: MOST })
    : { courses: await popularCourses(catalog, PAGE), teachers: [], files: [] };
  const [cScores, tScores, faces, fileCounts] = await Promise.all([courseRatings(), teacherRatings(), faceMap(), filesPerCourse()]);
  const nameOf = new Map(catalog.teachers.map((t) => [t.id, t.display_name]));
  const results = [
    ...found.courses.map((c) => courseResult(c, cScores.get(c.code), fileCounts.get(c.code) ?? 0, c.teachers.flatMap((id) => nameOf.get(id) ?? []))),
    ...found.teachers.map((t) => teacherResult(t, tScores.get(t.id), faces.has(t.id))),
    ...found.files.map(fileResult),
  ];
  const next = offset + PAGE;
  return answerInlineQuery(query.id, results.slice(offset, next), next < results.length ? String(next) : "", site());
}
