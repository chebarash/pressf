import { createHash } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { getCatalog } from "@/lib/catalog";
import type { Course, Teacher } from "@/lib/catalog";
import { popularCourses } from "@/lib/content";
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
const label = (path: string) => `pressf.chebarash.uz${path}`;
const searchButton = { text: "Search Press F", switch_inline_query_current_chat: "" };
const keyboard = (...links: Array<[string, string]>) => ({
  inline_keyboard: [links.map(([text, path]) => ({ text, url: `${site()}${path}` })), [searchButton]],
});
const scored = (rating?: Rating) => (rating ? `★ ${rating.overall.toFixed(1)} from ${plural(rating.count, "student")}` : "No ratings yet");
const lines = (...parts: Array<string | null | undefined>) => parts.filter((part) => part != null).join("\n");
const dots = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(" · ");
const star = (rating?: Rating) => (rating ? `★ ${rating.overall.toFixed(1)}` : null);
const thumb = (query: string) => `${site()}/thumb?${query}`;

/** A card with the page's own preview image above the text. */
const article = (kind: string, id: string, title: string, description: string, text: string, path: string, buttons: ReturnType<typeof keyboard>, thumbnail: string) => ({
  type: "article", id: resultId(kind, id), title, description, thumbnail_url: thumbnail, thumbnail_width: 160, thumbnail_height: 160,
  input_message_content: {
    message_text: lines(text, "", `<a href="${site()}${path}">${esc(label(path))}</a>`), parse_mode: "HTML",
    link_preview_options: { url: `${site()}${path}`, prefer_large_media: true, show_above_text: true },
  },
  reply_markup: buttons,
});

function courseResult(course: Course, rating: Rating | undefined, files: number, teachers: string[]) {
  const path = `/courses/${course.code}`;
  const taught = teachers.length ? `Taught by ${teachers.slice(0, 3).join(", ")}${teachers.length > 3 ? ` and ${teachers.length - 3} more` : ""}` : null;
  const fileLine = files ? plural(files, "file") : null;
  const text = lines(`<b>${esc(course.subject)}</b>`, course.code, "", scored(rating), taught && esc(taught), fileLine);
  const buttons = keyboard(["Open course", path], ...(files ? [["Files", `${path}#files`] as [string, string]] : []));
  return article("course", course.code, course.subject, dots("Course", course.code, star(rating), fileLine), text, path, buttons, thumb(`score=${rating?.overall.toFixed(1) ?? ""}`));
}

function teacherResult(teacher: Teacher, rating: Rating | undefined) {
  const id = encodeURIComponent(teacher.id);
  const path = `/professors/${id}`;
  const courses = teacher.teaches.length ? plural(teacher.teaches.length, "course") : null;
  const text = lines(`<b>${esc(teacher.display_name)}</b>`, teacher.department && esc(teacher.department), "", scored(rating), courses && `Teaches ${courses}`);
  return article("teacher", teacher.id, teacher.display_name, dots("Professor", teacher.department?.replace(/^Department of /, ""), star(rating)), text, path, keyboard(["Open profile", path]), thumb(`face=${id}`));
}

function fileResult(file: Material) {
  const name = file.fileName.replace(/\.[a-z0-9]+$/i, "");
  const course = [file.courseCode, file.courseName].filter(Boolean).join(" ");
  const kind = file.type ? file.type[0].toUpperCase() + file.type.slice(1) : "File";
  const description = dots(kind, file.term, file.hasSolutions && "With solutions");
  const text = lines(`<b>${esc(name)}</b>`, course ? esc(course) : null);
  const coursePath = file.courseCode ? `/courses/${file.courseCode}#files` : "/files";
  const isPdf = file.mimeType === "application/pdf" && /\.pdf$/i.test(file.fileName);
  const image = thumb(`kind=${file.type ?? ""}`);
  if (!isPdf || file.size > MAX_SHARED_SIZE) return article("file", file.id, name, description, text, `/files/${file.id}`, keyboard(["Open file", `/files/${file.id}`]), image);
  return {
    type: "document", id: resultId("file", file.id), title: name, description,
    document_url: `${site()}/files/${file.id}/${encodeURIComponent(file.fileName)}`,
    mime_type: "application/pdf", caption: text, parse_mode: "HTML", thumbnail_url: image, thumbnail_width: 160, thumbnail_height: 160,
    reply_markup: keyboard(["Open course", coursePath]),
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
  const [cScores, tScores, fileCounts] = await Promise.all([courseRatings(), teacherRatings(), filesPerCourse()]);
  const nameOf = new Map(catalog.teachers.map((t) => [t.id, t.display_name]));
  const results = [
    ...found.courses.map((c) => courseResult(c, cScores.get(c.code), fileCounts.get(c.code) ?? 0, c.teachers.flatMap((id) => nameOf.get(id) ?? []))),
    ...found.teachers.map((t) => teacherResult(t, tScores.get(t.id))),
    ...found.files.map(fileResult),
  ];
  const next = offset + PAGE;
  return answerInlineQuery(query.id, results.slice(offset, next), next < results.length ? String(next) : "", site(), results.length ? "Open Press F" : "Nothing found. Open Press F");
}
