import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { cache } from "react";
import { describeFile, FORMAT_CODE, formatOf, TYPE_LABEL, type FileType } from "@/core/files";
import { SITE_URL, path } from "@/core/links";
import { displayName } from "@/core/people";
import { hoursLabel, MIN_RATINGS } from "@/core/ratings";
import { WEEKS, nextPhase } from "@/core/semester";
import { db } from "@/lib/db";
import { faces, lmsCourseTeachers, lmsCourses, lmsDepartments, lmsFiles, lmsTeachers, uploads } from "@/lib/db/schema";
import { fileOverride, overlay } from "./decisions";
import { linkSecret } from "./identity";
import { courseSummary, teacherSummary } from "./ratings";

/**
 * Share previews: what a link to Press F shows in Telegram and elsewhere.
 * Page metadata calls the *Metadata helpers (title, description, og:image);
 * /og/<kind>/<id> renders the image (src/app/og). Image URLs carry `v`, a
 * digest of the card's data, so they can be cached forever and change when
 * the data does. Lookups are a few indexed queries on harvested tables; the
 * LMS is never called.
 */

export const OG_SIZE = { width: 1200, height: 630 };
const SITE_NAME = "Press F";

export type OgKind = "app" | "course" | "course-new" | "professor" | "file" | "rate" | "next" | "anonymous" | "telegram";

const digest = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("base64url").slice(0, 10);

/** Path of an OG image: /og/course/MATH111?v=… */
export function ogImagePath(kind: OgKind, id?: string | null, data?: unknown) {
  const base = id ? `/og/${kind}/${encodeURIComponent(id)}` : `/og/${kind}`;
  return data === undefined ? base : `${base}?v=${digest(data)}`;
}

const slug = (code: string) => code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/* ---------- data ---------- */

export type CourseOg = {
  kind: "course" | "course-new";
  code: string;
  name: string;
  credits: string | null;
  stats: { recommendPct: number; hours: string; difficulty: string } | null;
  ratings: number;
  teachers: string[];
  files: number;
};

const courseRows = cache(async (code: string) =>
  db().select().from(lmsCourses).where(sql`upper(regexp_replace(${lmsCourses.code}, '[^A-Za-z0-9]', '', 'g')) = ${slug(code)}`).orderBy(desc(lmsCourses.fetchedAt)).limit(20),
);

/** Course card data; numbers only from ≥ MIN_RATINGS ratings, otherwise OG/Course · new. */
export const courseOg = cache(async (code: string): Promise<CourseOg | null> => {
  const rows = await courseRows(code);
  const course = rows[0];
  if (!course) return null;
  const ids = rows.map((r) => r.id);
  const [summary, teachers, lms, students] = await Promise.all([
    courseSummary(course.id),
    db()
      .selectDistinct({ id: lmsTeachers.id, first: lmsTeachers.firstName, last: lmsTeachers.lastName })
      .from(lmsCourseTeachers)
      .innerJoin(lmsTeachers, eq(lmsTeachers.id, lmsCourseTeachers.teacherId))
      .where(inArray(lmsCourseTeachers.courseId, ids))
      .limit(3),
    db().select({ n: sql<number>`count(*)::int` }).from(lmsFiles).where(inArray(lmsFiles.courseId, ids)),
    db().select({ n: sql<number>`count(*)::int` }).from(uploads).where(and(inArray(uploads.courseId, ids), eq(uploads.status, "live"))),
  ]);
  const enough = summary.enough && summary.count >= MIN_RATINGS;
  return {
    kind: enough ? "course" : "course-new",
    code: course.code,
    name: course.name,
    credits: course.credits ? `${course.credits} ECTS` : null,
    stats: summary.enough && enough ? { recommendPct: summary.recommendPct, hours: hoursLabel(summary.hours), difficulty: summary.difficulty == null ? "—" : `${Math.round(summary.difficulty)}/5` } : null,
    ratings: summary.count,
    teachers: teachers.map((t) => displayName({ first_name_en: t.first, last_name_en: t.last })),
    files: (lms[0]?.n ?? 0) + (students[0]?.n ?? 0),
  };
});

export function courseLine(c: CourseOg) {
  const files = c.files ? `${c.files} ${c.files === 1 ? "file" : "files"}` : null;
  const people = c.teachers.join(" · ");
  return [people, files].filter(Boolean).join(" — ") || null;
}

export type ProfessorOg = { id: string; name: string; line: string | null; pressFPct: number | null; tags: string[]; ratings: number; faceKey: string | null; faceVersion: string | null };

export const professorOg = cache(async (id: string): Promise<ProfessorOg | null> => {
  const [t] = await db().select().from(lmsTeachers).where(eq(lmsTeachers.id, id));
  if (!t) return null;
  const [courses, summary, face] = await Promise.all([
    db()
      .selectDistinct({ name: lmsCourses.name, dept: lmsDepartments.name })
      .from(lmsCourseTeachers)
      .innerJoin(lmsCourses, eq(lmsCourses.id, lmsCourseTeachers.courseId))
      .leftJoin(lmsDepartments, eq(lmsDepartments.id, lmsCourses.departmentId))
      .where(eq(lmsCourseTeachers.teacherId, id))
      .limit(12),
    teacherSummary(id),
    db().select().from(faces).where(eq(faces.teacherId, id)),
  ]);
  const names = [...new Set(courses.map((c) => c.name))].slice(0, 3);
  const dept = courses.find((c) => c.dept)?.dept ?? null;
  const line = [dept, names.join(", ") || null].filter(Boolean).join(" · ") || null;
  return {
    id,
    name: displayName({ first_name_en: t.firstName, last_name_en: t.lastName }),
    line,
    pressFPct: summary.enough ? summary.pressFPct : null,
    tags: summary.enough ? summary.tags.slice(0, 2).map((x) => x.tag) : [],
    ratings: summary.count,
    faceKey: face[0]?.storageKey ?? null,
    faceVersion: face[0]?.updatedAt.toISOString() ?? null,
  };
});

export type FileOg = {
  id: string;
  title: string;
  type: FileType;
  week: number | null;
  courseName: string;
  courseCode: string | null;
  term: string | null;
  format: string;
  source: "lms" | "students" | "exam";
  exam: string | null;
  uploadedAt: string | null;
  showName: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** File card data: LMS material id or a live student upload (uuid). Hidden uploads give null. */
export const fileOg = cache(async (id: string): Promise<FileOg | null> => {
  if (UUID.test(id)) {
    const [u] = await db().select().from(uploads).where(and(eq(uploads.id, id), eq(uploads.status, "live")));
    if (!u) return null;
    const [c] = await db().select({ name: lmsCourses.name, code: lmsCourses.code }).from(lmsCourses).where(eq(lmsCourses.id, u.courseId));
    const type = (u.type in TYPE_LABEL ? u.type : "other") as FileType;
    return {
      id, title: u.title, type, week: u.week, courseName: c?.name ?? u.courseCode ?? "Course", courseCode: c?.code ?? u.courseCode, term: u.term,
      format: FORMAT_CODE[formatOf(u.fileName)], source: type === "exam" || type === "mock" ? "exam" : "students", exam: u.exam, uploadedAt: u.createdAt.toISOString(), showName: u.showName,
    };
  }
  const [[f], edit] = await Promise.all([db().select().from(lmsFiles).where(eq(lmsFiles.id, id)), fileOverride(id)]);
  if (!f || edit?.hidden) return null;
  const [c] = await db().select({ name: lmsCourses.name, code: lmsCourses.code }).from(lmsCourses).where(eq(lmsCourses.id, f.courseId));
  const d = describeFile(f.name, { courseCode: c?.code ?? f.code, courseName: c?.name, extension: f.extension ?? undefined });
  // Admin edits (rename, type, week) show on the card too.
  const shown = overlay({ title: d.title, type: d.type, week: d.week ?? null }, edit)!;
  return {
    id, title: shown.title, type: shown.type, week: shown.week, courseName: c?.name ?? f.code, courseCode: c?.code ?? f.code, term: null,
    format: FORMAT_CODE[d.format], source: "lms", exam: null, uploadedAt: f.fetchedAt.toISOString(), showName: false,
  };
});

export function fileChip(f: FileOg) {
  const kind = f.source === "exam" ? "Past exam" : TYPE_LABEL[f.type];
  return f.week != null ? `Week ${f.week} · ${kind}` : kind;
}

export const fileLine = (f: FileOg) => [f.courseName, f.format, f.source === "lms" ? "from NewUU LMS" : "from students"].join(" · ");

/** "Fall 2026" for the semester running (or about to start) at `now`; `offset` 1 = the one after. */
export function termName(now = new Date(), offset = 0) {
  const day = now.toISOString().slice(0, 10);
  const cur = WEEKS.find((w) => w.ends >= day) ?? WEEKS[WEEKS.length - 1];
  let term: "Spring" | "Fall" = cur.term === "spring" ? "Spring" : "Fall";
  let year = Number(cur.starts.slice(0, 4));
  for (let k = 0; k < offset; k++) {
    if (term === "Fall") {
      term = "Spring";
      year += 1;
    } else term = "Fall";
  }
  return `${term} ${year}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Spring 2027 · registration opens 12 Nov" (or just the term). */
export function nextChip(now = new Date()) {
  const reg = nextPhase(now, ["registration"]);
  const term = termName(now, 1);
  if (!reg || reg.inDays <= 0) return term;
  const [, m, d] = reg.starts.split("-").map(Number);
  return `${term} · registration opens ${d} ${MONTHS[m - 1]}`;
}

export type NextOg = { code: string; name: string; chip: string; cohorts: Array<{ label: string; detail: string | null; score: string | null }> };

/** Next-semester card: the course's teachers with their Press F share (≥ MIN_RATINGS only). */
export const nextOg = cache(async (code: string): Promise<NextOg | null> => {
  const rows = await courseRows(code);
  const course = rows[0];
  if (!course) return null;
  const teachers = await db()
    .selectDistinct({ id: lmsTeachers.id, first: lmsTeachers.firstName, last: lmsTeachers.lastName, role: lmsCourseTeachers.role })
    .from(lmsCourseTeachers)
    .innerJoin(lmsTeachers, eq(lmsTeachers.id, lmsCourseTeachers.teacherId))
    .where(inArray(lmsCourseTeachers.courseId, rows.map((r) => r.id)))
    .limit(6);
  const seen = new Set<string>();
  const unique = teachers.filter((t) => !seen.has(t.id) && seen.add(t.id)).slice(0, 2);
  const scores = await Promise.all(unique.map((t) => teacherSummary(t.id)));
  return {
    code: course.code,
    name: course.name,
    chip: nextChip(),
    cohorts: unique.map((t, i) => {
      const s = scores[i];
      return { label: displayName({ first_name_en: t.first, last_name_en: t.last }), detail: t.role ?? null, score: s.enough ? `${s.pressFPct}% F` : null };
    }),
  };
});

/* ---------- metadata ---------- */

type Meta = { title: string; description: string; path: string; image: string; alt: string };

/** Next metadata with an OG image (Telegram reads og:title, og:description and og:image). */
export function ogMetadata(m: Meta): Metadata {
  const image = { url: m.image, width: OG_SIZE.width, height: OG_SIZE.height, alt: m.alt, type: "image/png" };
  return {
    title: m.title,
    description: m.description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: m.path },
    openGraph: { type: "website", siteName: SITE_NAME, title: m.title, description: m.description, url: m.path, images: [image] },
    twitter: { card: "summary_large_image", title: m.title, description: m.description, images: [image] },
  };
}

const APP_DESCRIPTION = "Timetable, files by week, grades and absences from LMS — plus what students really think of every course.";

export function appMetadata(): Metadata {
  return ogMetadata({ title: "Press F — your NewUU day, in one place", description: APP_DESCRIPTION, path: "/", image: ogImagePath("app"), alt: "Press F" });
}

export async function courseMetadata(code: string): Promise<Metadata> {
  const c = await courseOg(code);
  if (!c) return appMetadata();
  const description = c.stats
    ? `${c.stats.recommendPct}% would recommend · ${c.stats.hours} a week · ${c.stats.difficulty} hard. ${courseLine(c) ?? ""}`.trim()
    : `New — not enough ratings yet. Took ${c.name}? Be one of the first five.`;
  return ogMetadata({ title: `${c.name} (${c.code}) — Press F`, description, path: path({ to: "course", code: c.code }), image: ogImagePath(c.kind, slug(c.code), c), alt: c.name });
}

export async function professorMetadata(id: string): Promise<Metadata> {
  const p = await professorOg(id);
  if (!p) return appMetadata();
  const description = p.pressFPct != null ? `${p.pressFPct}% pressed F — would take again. ${p.line ?? ""}`.trim() : (p.line ?? "Ratings from NewUU students on Press F.");
  return ogMetadata({ title: `${p.name} — Press F`, description, path: path({ to: "professor", id }), image: ogImagePath("professor", id, p), alt: p.name });
}

export async function fileMetadata(id: string): Promise<Metadata> {
  const f = await fileOg(id);
  if (!f) return appMetadata();
  return ogMetadata({ title: `${f.title} — ${f.courseName}`, description: `${fileLine(f)}. Opens in Press F — sign in with your NewUU account.`, path: path({ to: "file", id }), image: ogImagePath("file", id, f), alt: f.title });
}

export function rateMetadata(term = termName()): Metadata {
  return ogMetadata({ title: `Rate ${term} — Press F`, description: "30 seconds a course, anonymous. Next year's students pick sections by it.", path: "/rate", image: `${ogImagePath("rate")}?term=${encodeURIComponent(term)}`, alt: `Rate ${term}` });
}

export async function nextMetadata(code: string): Promise<Metadata> {
  const n = await nextOg(code);
  if (!n) return appMetadata();
  return ogMetadata({ title: `${n.name} — who to pick · Press F`, description: `${n.chip}. What students say about each teacher.`, path: path({ to: "next", code: n.code }), image: ogImagePath("next", slug(n.code), n), alt: n.name });
}

export type AnonymousOg = { courseName: string; text: string; replies: number };

/** Signature for anonymous-post image params, so the route renders only text we put in metadata. */
export function signAnonymous(d: AnonymousOg) {
  return createHmac("sha256", linkSecret()).update(`og-anon:${JSON.stringify([d.courseName, d.text, d.replies])}`).digest("base64url").slice(0, 22);
}

export function verifyAnonymous(d: AnonymousOg, sig: string | null) {
  if (!sig) return false;
  const a = Buffer.from(signAnonymous(d));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Anonymous post: text only, never who wrote it. There is no posts table yet,
 * so the page passes the post in; the image URL carries the text, signed.
 * Hidden posts should use courseMetadata instead.
 */
export function anonymousMetadata(post: { id: string } & AnonymousOg): Metadata {
  const d: AnonymousOg = { courseName: post.courseName, text: post.text.slice(0, 400), replies: post.replies };
  const short = d.text.length > 140 ? `${d.text.slice(0, 139)}…` : d.text;
  const q = new URLSearchParams({ c: d.courseName, t: d.text, r: String(d.replies), s: signAnonymous(d) });
  return ogMetadata({ title: `Anonymous · ${d.courseName} — Press F`, description: `“${short}” — ${d.replies} ${d.replies === 1 ? "reply" : "replies"}`, path: `/a/${encodeURIComponent(post.id)}`, image: `${ogImagePath("anonymous", post.id)}?${q}`, alt: `Anonymous post in ${d.courseName}` });
}

export function telegramMetadata(): Metadata {
  return ogMetadata({ title: "Open Press F in Telegram", description: "Alerts before class, QR check-in, grades the minute they land.", path: "/", image: ogImagePath("telegram"), alt: "Open Press F in Telegram" });
}

