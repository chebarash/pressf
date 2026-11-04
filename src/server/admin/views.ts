/**
 * One view model per admin page. Postgres only (never the LMS), parallel
 * queries inside. Nothing here can link a person to a rating or to an
 * Anonymous post: ratings are counted by pseudonym, posts carry no author.
 */
import { teacherNamesByCode } from "@/server/views/shared";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, like, max, ne, notInArray, or, sql, sum } from "drizzle-orm";
import { describeFile, TYPE_LABEL, type FileType } from "@/core/files";
import { displayName, initials } from "@/core/people";
import { dayStart, DAY_MS, localDay } from "@/core/time";
import { trustOf, type Trust, type UploadStatus } from "@/core/uploads";
import { db } from "@/lib/db";
import {
  adminMarks, auditLog, broadcasts, courseRatings, feedItems, fileOverrides, lmsAccounts, lmsCache, lmsCourses,
  lmsCourseTeachers, lmsFiles, lmsTeachers, mentionLinks, mentions, reports, searchEvents, teacherAliases, teacherRatings, uploads, userRoles, userState, users,
} from "@/lib/db/schema";
import { pseudonym } from "@/server/identity";
import { syllabusQueueItems } from "@/server/syllabus-queue";
import { openReports } from "@/server/reports";
import { settings } from "./marks";
import { orderBy, type AuditSort, type CourseSort, type PeopleSort, type UploadSort } from "./sorts";
import type { Sort } from "@/core/sort";
import { audienceLabel, checkFlag, checkLines, reasonLabel, reasonShort, ruleFor, twins, yearOf, type Audience } from "./rules";

const HOUR = 3600_000;
const age = (from: Date, now: Date) => {
  const m = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} d`;
};
const n = (v: number | string | null | undefined) => Number(v ?? 0);
const fmt = (v: number) => v.toLocaleString("en-US");

type CacheData = { profile?: { name?: string; semesters?: unknown[] } | null; enrollment?: { codes?: string[] } | null };
const profileName = (data: unknown) => (data as CacheData | null)?.profile?.name ?? null;
const semesterCount = (data: unknown) => (data as CacheData | null)?.profile?.semesters?.length ?? null;

/** A short, privacy-safe label for a student: "Aziz Tursunov · Y2" or their email name. */
function personLabel(email: string, data: unknown) {
  const name = profileName(data) ?? email.split("@")[0];
  const year = yearOf(semesterCount(data));
  return { name, year, initials: initials(name) || "?" };
}

/* ───────── Sidebar ───────── */

/** Sidebar: queue counts and the signed-in staff member's name. */
export async function chrome(viewer: { id: string; email: string }) {
  const [[up], open, [me]] = await Promise.all([
    db().select({ n: count() }).from(uploads).where(eq(uploads.status, "waiting")),
    db().select({ n: sql<number>`count(distinct (${reports.targetKind}, ${reports.targetId}))` }).from(reports).where(eq(reports.status, "open")),
    db().select({ data: lmsCache.data }).from(lmsCache).where(eq(lmsCache.userId, viewer.id)),
  ]);
  const p = personLabel(viewer.email, me?.data);
  return { counts: { uploads: n(up?.n), reports: n(open[0]?.n) }, me: { name: shortPerson(p.name), initials: p.initials } };
}

/* ───────── Health (overview + system) ───────── */

/** An ISO timestamp read out of a JSON snapshot, as a Date (null when absent or unreadable). */
const snapshotAt = (expr: ReturnType<typeof sql>) =>
  expr.mapWith((v: unknown) => {
    const d = v ? new Date(String(v)) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  });
const newest = (...xs: Array<Date | null>) => xs.reduce<Date | null>((a, b) => (b && (!a || b > a) ? b : a), null);

type Job = { id: string; name: string; every: string; lastRun: Date | null; result: string; ok: boolean; run?: "sync" | "harvest" };

async function health(now: Date) {
  const day = new Date(now.getTime() - DAY_MS);
  const week = new Date(now.getTime() - 7 * DAY_MS);
  const [[signIn], [synced], accounts, files, catalog, sent, absences, store, linked, flags] = await Promise.all([
    db().select({ at: max(lmsCache.syncedAt), n: count() }).from(lmsCache),
    // The 5-minute student sync writes the snapshot in user_state; lms_cache only changes at sign-in.
    db().select({ at: snapshotAt(sql`max(${userState.snapshot}->'lms'->>'at')`) }).from(userState),
    db().select({ status: lmsAccounts.status, n: count() }).from(lmsAccounts).groupBy(lmsAccounts.status),
    db().select({ at: max(lmsFiles.fetchedAt), week: sql<number>`count(*) filter (where ${lmsFiles.fetchedAt} > ${week})`, size: sum(lmsFiles.size) }).from(lmsFiles),
    db().select({ at: max(lmsCourses.fetchedAt), n: count() }).from(lmsCourses),
    db().select({ at: max(feedItems.sentAt), day: count() }).from(feedItems).where(gte(feedItems.sentAt, day)),
    db().select({ at: max(feedItems.at), day: count() }).from(feedItems).where(and(eq(feedItems.kind, "absence"), gte(feedItems.at, day))),
    db().select({ size: sum(uploads.size) }).from(uploads),
    db().select({ n: count() }).from(users).where(isNotNull(users.telegramId)),
    settings(),
  ]);
  const cache = [{ at: newest(signIn?.at ?? null, synced?.at ?? null), n: signIn?.n ?? 0 }];
  const late = (at: Date | null, everyMs: number) => !at || now.getTime() - at.getTime() > 3 * everyMs;
  const ago = (at: Date | null) => (at ? (now.getTime() - at.getTime() < 60_000 ? "now" : `${age(at, now)} ago`) : "never");
  const jobs: Job[] = [
    { id: "cache", name: "Timetable + gradebook cache", every: "15 min", lastRun: cache[0]?.at ?? null, result: `${fmt(n(cache[0]?.n))} students`, ok: !late(cache[0]?.at ?? null, 15 * 60_000) },
    { id: "notify", name: "Notifications → bot", every: "1 min", lastRun: sent[0]?.at ?? null, result: `${fmt(n(sent[0]?.day))} sent`, ok: true },
    { id: "harvest", name: "File harvest", every: "1 h", lastRun: files[0]?.at ?? null, result: `${fmt(n(files[0]?.week))} new files`, ok: !late(files[0]?.at ?? null, HOUR * 24), run: "harvest" },
    { id: "absence", name: "Attendance → absence alerts", every: "10 min", lastRun: absences[0]?.at ?? null, result: `${fmt(n(absences[0]?.day))} alerts`, ok: true },
    { id: "catalog", name: "Catalog sync", every: "daily 03:00", lastRun: catalog[0]?.at ?? null, result: `${fmt(n(catalog[0]?.n))} courses`, ok: !late(catalog[0]?.at ?? null, DAY_MS), run: "sync" },
  ];
  const active = n(accounts.find((a) => a.status === "active")?.n);
  const invalid = n(accounts.find((a) => a.status === "invalid")?.n);
  const bytes = n(files[0]?.size) + n(store[0]?.size);
  return {
    jobs: jobs.map((j) => ({ ...j, lastRunText: ago(j.lastRun) })),
    jobsOk: jobs.filter((j) => j.ok).length,
    lmsSyncedAt: cache[0]?.at ?? null,
    lmsSyncText: cache[0]?.at ? `${jobs[0].ok ? "OK" : "Late"} · ${ago(cache[0].at)}` : "Not run yet",
    signIns: active + invalid ? `${((active / (active + invalid)) * 100).toFixed(1)}% · ${fmt(invalid)} changed password` : "No accounts yet",
    harvest: files[0]?.at ? `${jobs[2].ok ? "OK" : "Late"} · ${fmt(n(files[0]?.week))} new this week` : "Not run yet",
    delivered: `${fmt(n(sent[0]?.day))} in 24 h`,
    linked: n(linked[0]?.n),
    storage: bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`,
    settings: flags,
  };
}

/* ───────── A1 Overview ───────── */

type NeedRow = { kind: "upload" | "report"; title: string; meta: string; age: string; href: string; at: number };

export async function overview(now = new Date()) {
  const today = dayStart(localDay(now));
  const week = new Date(now.getTime() - 7 * DAY_MS);
  const [waiting, open, todayN, signedIn, h, weekUploads, ratingsWeek, hiddenWeek, postsTotal, shared] = await Promise.all([
    db()
      .select({ id: uploads.id, title: uploads.title, type: uploads.type, createdAt: uploads.createdAt, checks: uploads.checks, uploaderId: uploads.uploaderId, course: lmsCourses.name, code: uploads.courseCode })
      .from(uploads)
      .leftJoin(lmsCourses, eq(lmsCourses.id, uploads.courseId))
      .where(eq(uploads.status, "waiting"))
      .orderBy(asc(uploads.createdAt))
      .limit(50),
    openReports(),
    db().select({ n: count() }).from(lmsAccounts).where(gte(lmsAccounts.lastUsedAt, today)),
    db().select({ n: count() }).from(users),
    health(now),
    db()
      .select({ status: uploads.status, n: count(), median: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from ${uploads.reviewedAt} - ${uploads.createdAt})) filter (where ${uploads.sourceKey} is null)` })
      .from(uploads)
      .where(gte(uploads.reviewedAt, week))
      .groupBy(uploads.status),
    db().select({ n: count() }).from(courseRatings).where(gte(courseRatings.createdAt, week)),
    db().select({ n: count() }).from(adminMarks).where(and(eq(adminMarks.kind, "post-hidden"), gte(adminMarks.at, week))),
    db().select({ n: count() }).from(mentions),
    shareTotals(week),
  ]);
  const posts = await postsById(open.filter((r) => r.kind === "post").map((r) => r.id));
  const files = await uploadsById(open.filter((r) => r.kind === "file").map((r) => r.id));
  const reportAt = await firstReportAt(open.map((r) => `${r.kind}:${r.id}`));

  const trusted = await trustMap(waiting.map((w) => w.uploaderId).filter((x): x is string => !!x));
  const rows: NeedRow[] = [
    ...waiting.slice(0, 6).map((w) => {
      const flag = checkFlag(w.checks);
      const tag = flag === "lms" ? "maybe in LMS" : flag === "check" ? "needs a check" : w.uploaderId && trusted.get(w.uploaderId) === "trusted" ? "trusted uploader" : "new uploader";
      return { kind: "upload" as const, title: w.title, meta: [w.course ?? w.code, TYPE_LABEL[w.type as FileType]?.toLowerCase() ?? w.type, tag].filter(Boolean).join(" · "), age: age(w.createdAt, now), href: `/admin/uploads?id=${w.id}`, at: w.createdAt.getTime() };
    }),
    ...open.slice(0, 6).map((r) => {
      const post = r.kind === "post" ? posts.get(r.id) : null;
      const file = r.kind === "file" ? files.get(r.id) : null;
      const at = reportAt.get(`${r.kind}:${r.id}`) ?? now;
      return {
        kind: "report" as const,
        title: post ? `'${snippet(post.text, 34)}'` : file?.title ?? "Removed item",
        meta: [post ? "Anonymous" : "Student file", post?.course ?? file?.course, `${r.total} report${r.total === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
        age: age(at, now),
        href: `/admin/reports?item=${r.kind}:${r.id}`,
        at: at.getTime(),
      };
    }),
  ]
    .sort((a, b) => a.at - b.at)
    .slice(0, 6);

  const live = weekUploads.find((s) => s.status === "live");
  const rejected = n(weekUploads.find((s) => s.status === "rejected")?.n);
  const medianSec = weekUploads.filter((s) => s.status !== "waiting").map((s) => n(s.median)).filter(Boolean);
  const median = medianSec.length ? Math.round(medianSec.reduce((a, b) => a + b, 0) / medianSec.length / 3600) : null;
  const postReports = open.filter((r) => r.kind === "post").length;
  const sinceSync = h.lmsSyncedAt ? age(h.lmsSyncedAt, now) : "—";
  const needs = (waiting.length ? 1 : 0) + (open.length ? 1 : 0);

  return {
    greeting: greeting(now),
    date: `${weekday(now)} ${Number(localDay(now).slice(8))} ${month(now)}`,
    needsText: needs ? `${needs} thing${needs === 1 ? "" : "s"} need${needs === 1 ? "s" : ""} you` : "nothing needs you",
    kpis: {
      uploads: { value: String(waiting.length), sub: waiting[0] ? `oldest ${age(waiting[0].createdAt, now)}` : "queue is empty" },
      reports: { value: String(open.length), sub: open.length ? `${postReports} post${postReports === 1 ? "" : "s"} · ${open.length - postReports} file${open.length - postReports === 1 ? "" : "s"}` : "nothing open" },
      students: { value: fmt(n(todayN[0]?.n)), sub: `of ${fmt(n(signedIn[0]?.n))} signed in` },
      sync: { value: sinceSync === "—" ? "—" : sinceSync, sub: h.jobsOk === h.jobs.length ? `all ${h.jobs.length} jobs OK` : `${h.jobs.length - h.jobsOk} job${h.jobs.length - h.jobsOk === 1 ? "" : "s"} late` },
    },
    rows,
    health: [
      { label: "LMS sync", value: h.lmsSyncText },
      { label: "LMS sign-ins", value: h.signIns },
      { label: "File harvest", value: h.harvest },
      { label: "Bot delivery", value: `${h.delivered} · ${fmt(h.linked)} linked` },
      { label: "Storage", value: h.storage },
      { label: "Errors (24 h)", value: "Not tracked yet", danger: false },
    ],
    shares: shared,
    week: `${fmt(n(live?.n))} student files went live · ${fmt(rejected)} not accepted · median review ${median === null ? "—" : `${median} h`} · ${fmt(n(ratingsWeek[0]?.n))} ratings · ${fmt(n(hiddenWeek[0]?.n))} of ${fmt(n(postsTotal[0]?.n))} Anonymous posts hidden`,
  };
}

/** Shares sent through the bot's inline mode (search_events "share:<kind>"): all time and this week, per kind, and the most shared. */
async function shareTotals(since: Date) {
  const [byKind, top] = await Promise.all([
    db()
      .select({ kind: searchEvents.kind, total: count(), week: sql<number>`count(*) filter (where ${searchEvents.createdAt} >= ${since})` })
      .from(searchEvents)
      .where(like(searchEvents.kind, "share:%"))
      .groupBy(searchEvents.kind),
    db()
      .select({ kind: searchEvents.kind, id: searchEvents.targetId, n: count() })
      .from(searchEvents)
      .where(like(searchEvents.kind, "share:%"))
      .groupBy(searchEvents.kind, searchEvents.targetId)
      .orderBy(desc(count()))
      .limit(5),
  ]);
  const kindOf = (k: string) => k.replace(/^share:/, "");
  const courseNames = new Map(
    (top.some((t) => kindOf(t.kind) === "course")
      ? await db().selectDistinctOn([lmsCourses.code], { code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses).where(inArray(lmsCourses.code, top.filter((t) => kindOf(t.kind) === "course").map((t) => t.id))).orderBy(lmsCourses.code, desc(lmsCourses.fetchedAt))
      : []
    ).map((c) => [c.code.toUpperCase(), c.name]),
  );
  const LABEL: Record<string, string> = { course: "courses", professor: "professors", file: "files", app: "the app" };
  const total = byKind.reduce((a, r) => a + n(r.total), 0);
  const week = byKind.reduce((a, r) => a + n(r.week), 0);
  return {
    total: fmt(total),
    week: fmt(week),
    byKind: byKind.map((r) => ({ label: LABEL[kindOf(r.kind)] ?? kindOf(r.kind), total: fmt(n(r.total)) })),
    top: top.map((t) => {
      const kind = kindOf(t.kind);
      const href = kind === "course" ? `/c/${encodeURIComponent(t.id)}` : kind === "professor" ? `/p/${encodeURIComponent(t.id)}` : kind === "file" ? `/f/${encodeURIComponent(t.id)}` : "/";
      return { label: kind === "course" ? `${courseNames.get(t.id) ?? t.id} · ${t.id}` : kind === "app" ? "Press F" : `${kind} ${t.id}`, n: fmt(n(t.n)), href };
    }),
  };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekday = (d: Date) => WEEKDAYS[new Date(`${localDay(d)}T00:00:00Z`).getUTCDay()];
const month = (d: Date) => MONTHS[Number(localDay(d).slice(5, 7)) - 1];
function greeting(now: Date) {
  const h = (now.getUTCHours() + 5) % 24;
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
const snippet = (s: string, len: number) => (s.length > len ? `${s.slice(0, len).trimEnd()}…` : s);

async function trustMap(ids: string[]) {
  const out = new Map<string, Trust>();
  if (!ids.length) return out;
  const [hist, manual] = await Promise.all([
    db().select({ id: uploads.uploaderId, status: uploads.status, n: count() }).from(uploads).where(inArray(uploads.uploaderId, ids)).groupBy(uploads.uploaderId, uploads.status),
    db().select({ id: userRoles.userId, manual: userRoles.manualTrust }).from(userRoles).where(inArray(userRoles.userId, ids)),
  ]);
  for (const id of new Set(ids)) {
    const of = (s: UploadStatus) => n(hist.find((h) => h.id === id && h.status === s)?.n);
    out.set(id, trustOf({ live: of("live"), rejected: of("rejected"), manualTrust: manual.find((m) => m.id === id)?.manual ?? null }));
  }
  return out;
}

async function postsById(ids: string[]) {
  const nums = ids.map(Number).filter((x) => Number.isInteger(x));
  const out = new Map<string, { text: string; url: string; date: Date | null; course: string | null; code: string | null }>();
  if (!nums.length) return out;
  const [rows, links] = await Promise.all([
    db().select().from(mentions).where(inArray(mentions.postId, nums)),
    db().select({ postId: mentionLinks.postId, code: mentionLinks.target, name: lmsCourses.name }).from(mentionLinks).leftJoin(lmsCourses, eq(lmsCourses.code, mentionLinks.target)).where(and(inArray(mentionLinks.postId, nums), eq(mentionLinks.kind, "course"))),
  ]);
  for (const r of rows) {
    const l = links.find((x) => x.postId === r.postId);
    out.set(String(r.postId), { text: r.text, url: r.url, date: r.date, course: l?.name ?? l?.code ?? null, code: l?.code ?? null });
  }
  return out;
}

async function uploadsById(ids: string[]) {
  const valid = ids.filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const out = new Map<string, { title: string; course: string | null; status: UploadStatus; type: string; createdAt: Date }>();
  if (!valid.length) return out;
  const rows = await db()
    .select({ id: uploads.id, title: uploads.title, course: lmsCourses.name, code: uploads.courseCode, status: uploads.status, type: uploads.type, createdAt: uploads.createdAt })
    .from(uploads)
    .leftJoin(lmsCourses, eq(lmsCourses.id, uploads.courseId))
    .where(inArray(uploads.id, valid));
  for (const r of rows) out.set(r.id, { title: r.title, course: r.course ?? r.code, status: r.status, type: r.type, createdAt: r.createdAt });
  return out;
}

async function firstReportAt(keys: string[]) {
  const out = new Map<string, Date>();
  if (!keys.length) return out;
  const rows = await db()
    .select({ kind: reports.targetKind, id: reports.targetId, at: sql<Date>`min(${reports.createdAt})` })
    .from(reports)
    .where(eq(reports.status, "open"))
    .groupBy(reports.targetKind, reports.targetId);
  for (const r of rows) out.set(`${r.kind}:${r.id}`, new Date(r.at));
  return out;
}

/* ───────── A2 / A11 Uploads ───────── */

export type UploadTab = "waiting" | "live" | "rejected";

export async function uploadsPage(tab: UploadTab, selectedId: string | undefined, now = new Date(), sort: Sort<UploadSort> = null) {
  const byDefault = tab === "waiting" ? asc(uploads.createdAt) : desc(uploads.reviewedAt);
  const columns = {
    title: sql`lower(${uploads.title})`,
    course: sql`lower(coalesce(${lmsCourses.name}, ${uploads.courseCode}))`,
    type: sql`${uploads.type}`,
    // Age ascending: the newest first.
    age: { expr: sql`${uploads.createdAt}`, flip: true as const },
  };
  const [list, counts] = await Promise.all([
    db()
      .select({
        id: uploads.id, title: uploads.title, type: uploads.type, exam: uploads.exam, term: uploads.term, week: uploads.week, courseId: uploads.courseId, courseCode: uploads.courseCode,
        showName: uploads.showName, sourceLabel: uploads.sourceLabel, checks: uploads.checks, fileName: uploads.fileName, mimeType: uploads.mimeType, size: uploads.size, storageKey: uploads.storageKey,
        uploaderId: uploads.uploaderId, createdAt: uploads.createdAt, reviewedAt: uploads.reviewedAt, rejectReason: uploads.rejectReason, course: lmsCourses.name,
      })
      .from(uploads)
      .leftJoin(lmsCourses, eq(lmsCourses.id, uploads.courseId))
      .where(eq(uploads.status, tab))
      .orderBy(...(sort ? [orderBy(sort, columns), byDefault] : [byDefault]))
      .limit(100),
    db().select({ status: uploads.status, n: count() }).from(uploads).groupBy(uploads.status),
  ]);
  const uploaderIds = [...new Set(list.map((u) => u.uploaderId).filter((x): x is string => !!x))];
  const [trusts, people] = await Promise.all([
    trustMap(uploaderIds),
    uploaderIds.length
      ? db().select({ id: users.id, email: users.email, group: users.group, data: lmsCache.data }).from(users).leftJoin(lmsCache, eq(lmsCache.userId, users.id)).where(inArray(users.id, uploaderIds))
      : Promise.resolve([] as Array<{ id: string; email: string; group: string | null; data: unknown }>),
  ]);
  const history = uploaderIds.length
    ? await db().select({ id: uploads.uploaderId, status: uploads.status, n: count() }).from(uploads).where(inArray(uploads.uploaderId, uploaderIds)).groupBy(uploads.uploaderId, uploads.status)
    : [];

  const items = list.map((u) => {
    const person = people.find((p) => p.id === u.uploaderId);
    const trust = u.uploaderId ? trusts.get(u.uploaderId) ?? "normal" : "normal";
    const of = (s: UploadStatus) => n(history.find((h) => h.id === u.uploaderId && h.status === s)?.n);
    const courseName = u.course ?? u.courseCode ?? "this course";
    const year = person ? yearOf(semesterCount(person.data)) : null;
    const enrolled = ((person?.data as CacheData | null)?.enrollment?.codes ?? []).slice(0, 20);
    return {
      id: u.id,
      title: u.title,
      type: u.type,
      typeLabel: TYPE_LABEL[u.type as FileType] ?? u.type,
      exam: u.exam,
      term: u.term,
      week: u.week,
      courseId: u.courseId,
      courseCode: u.courseCode,
      courseName,
      showName: u.showName,
      shownAs: u.sourceLabel ? `From ${u.sourceLabel}` : u.showName && person ? `From ${profileName(person.data) ?? "students"}` : "From students",
      fileName: u.fileName,
      mimeType: u.mimeType,
      size: u.size,
      storageKey: u.storageKey,
      age: age(u.createdAt, now),
      trust,
      flag: tab === "waiting" ? checkFlag(u.checks) : null,
      checks: checkLines(u.checks, courseName),
      uploader: person
        ? { label: [year ? `Year ${year}` : null, person.group].filter(Boolean).join(" · ") || "Student", live: of("live"), rejected: of("rejected"), enrolled }
        : { label: "Account deleted", live: 0, rejected: 0, enrolled: [] as string[] },
      rejectReason: u.rejectReason,
    };
  });
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  // Course choices for the editable details: each uploader's enrolled courses plus the one picked.
  const codes = [...new Set(items.flatMap((i) => [...i.uploader.enrolled, ...(i.courseCode ? [i.courseCode] : [])]))];
  const courseOptions = codes.length
    ? await db().selectDistinctOn([lmsCourses.code], { id: lmsCourses.id, code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses).where(inArray(lmsCourses.code, codes)).orderBy(lmsCourses.code, desc(lmsCourses.fetchedAt))
    : [];
  for (const i of items) if (!courseOptions.some((c) => c.id === i.courseId)) courseOptions.push({ id: i.courseId, code: i.courseCode ?? "", name: i.courseName });
  const of = (s: UploadStatus) => n(counts.find((c) => c.status === s)?.n);
  return { tab, sort, items, selectedId: selected?.id ?? null, courseOptions, counts: { waiting: of("waiting"), live: of("live"), rejected: of("rejected") } };
}

/* ───────── A4 Reports ───────── */

export async function reportsPage(tab: "open" | "resolved", itemKey: string | undefined, now = new Date()) {
  const [open, resolvedRows, resolvedCount] = await Promise.all([
    openReports(),
    tab === "resolved"
      ? db()
          .select({ kind: reports.targetKind, id: reports.targetId, status: reports.status, reason: reports.reason, n: count(), at: max(reports.resolvedAt) })
          .from(reports)
          .where(ne(reports.status, "open"))
          .groupBy(reports.targetKind, reports.targetId, reports.status, reports.reason)
          .orderBy(desc(max(reports.resolvedAt)))
          .limit(200)
      : Promise.resolve([]),
    db().select({ n: sql<number>`count(distinct (${reports.targetKind}, ${reports.targetId}))` }).from(reports).where(ne(reports.status, "open")),
  ]);
  const base =
    tab === "open"
      ? open.map((r) => ({ kind: r.kind, id: r.id, total: r.total, reasons: r.reasons, outcome: null as string | null }))
      : Object.values(
          resolvedRows.reduce<Record<string, { kind: string; id: string; total: number; reasons: Record<string, number>; outcome: string | null }>>((acc, r) => {
            const k = `${r.kind}:${r.id}`;
            acc[k] ??= { kind: r.kind, id: r.id, total: 0, reasons: {}, outcome: r.status };
            acc[k].total += r.n;
            acc[k].reasons[r.reason] = (acc[k].reasons[r.reason] ?? 0) + r.n;
            return acc;
          }, {})
        ).slice(0, 50);
  const [posts, files, firstAt] = await Promise.all([
    postsById(base.filter((r) => r.kind === "post").map((r) => r.id)),
    uploadsById(base.filter((r) => r.kind === "file").map((r) => r.id)),
    firstReportAt(base.map((r) => `${r.kind}:${r.id}`)),
  ]);
  const items = base.map((r) => {
    const post = r.kind === "post" ? posts.get(r.id) : undefined;
    const file = r.kind === "file" ? files.get(r.id) : undefined;
    const top = Object.entries(r.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
    const course = post?.course ?? file?.course ?? null;
    const at = post?.date ?? firstAt.get(`${r.kind}:${r.id}`) ?? file?.createdAt ?? null;
    return {
      key: `${r.kind}:${r.id}`,
      kind: r.kind as "post" | "file",
      id: r.id,
      title: post ? `'${snippet(post.text, 40)}'` : file?.title ?? "Removed item",
      meta: [post ? "Anonymous post" : "Student file", course, `${r.total} report${r.total === 1 ? "" : "s"}`, reasonShort(top)].filter(Boolean).join(" · "),
      body: post?.text ?? file?.title ?? "",
      url: post?.url ?? (file ? `/f/${r.id}` : null),
      context: [post ? "ANONYMOUS POST" : "STUDENT FILE", course?.toUpperCase(), at ? ago(at, now).toUpperCase() : null].filter(Boolean).join(" · "),
      reasons: Object.entries(r.reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ label: reasonLabel(reason), count })),
      rule: ruleFor(r.reasons),
      outcome: r.outcome,
      fileStatus: file?.status ?? null,
      /** For sorting: how many reports, and when the item was posted / first reported (ms). */
      total: r.total,
      at: at ? at.getTime() : null,
    };
  });
  const selected = items.find((i) => i.key === itemKey) ?? items[0] ?? null;
  return { tab, items, selectedKey: selected?.key ?? null, counts: { open: open.length, resolved: n(resolvedCount[0]?.n) } };
}

function ago(at: Date, now: Date) {
  const days = Math.floor((now.getTime() - at.getTime()) / DAY_MS);
  if (days < 1) return `${age(at, now)} ago`;
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/* ───────── A5 Courses & files ───────── */

export async function coursesPage(q: string, sort: Sort<CourseSort> = null) {
  const term = q.trim();
  const latest = db()
    .selectDistinctOn([lmsCourses.code], { code: lmsCourses.code, name: lmsCourses.name, credits: lmsCourses.credits })
    .from(lmsCourses)
    .where(term ? or(ilike(lmsCourses.code, `%${term}%`), ilike(lmsCourses.name, `%${term}%`)) : undefined)
    .orderBy(lmsCourses.code, desc(lmsCourses.fetchedAt))
    .as("c");
  // The counts below, as SQL, so a sort by them picks the right 80 courses.
  const counted = {
    code: sql`lower(${latest.code})`,
    course: sql`lower(${latest.name})`,
    lms: sql`(select count(*) from ${lmsFiles} where ${lmsFiles.code} = ${latest.code})`,
    students: sql`(select count(*) from ${uploads} where ${uploads.courseCode} = ${latest.code} and ${uploads.status} in ('live', 'hidden'))`,
    shares: sql`(select count(*) from ${searchEvents} where ${searchEvents.kind} = 'share:course' and ${searchEvents.targetId} = upper(${latest.code}))`,
  };
  const rows = await db()
    .select({ code: latest.code, name: latest.name, credits: latest.credits })
    .from(latest)
    .orderBy(...(sort ? [orderBy(sort, counted), latest.code] : [latest.code]))
    .limit(80);
  const codes = rows.map((r) => r.code);
  const [lms, students, shared] = codes.length
    ? await Promise.all([
        db().select({ code: lmsFiles.code, n: count() }).from(lmsFiles).where(inArray(lmsFiles.code, codes)).groupBy(lmsFiles.code),
        db().select({ code: uploads.courseCode, n: count() }).from(uploads).where(and(inArray(uploads.courseCode, codes), inArray(uploads.status, ["live", "hidden"]))).groupBy(uploads.courseCode),
        // Inline-mode shares of the course card (chosen_inline_result).
        db().select({ code: searchEvents.targetId, n: count() }).from(searchEvents).where(and(eq(searchEvents.kind, "share:course"), inArray(searchEvents.targetId, codes.map((c) => c.toUpperCase())))).groupBy(searchEvents.targetId),
      ])
    : [[], [], []];
  return {
    q: term,
    sort,
    courses: rows.map((r) => ({ ...r, lms: n(lms.find((x) => x.code === r.code)?.n), students: n(students.find((x) => x.code === r.code)?.n), shares: n(shared.find((x) => x.code === r.code.toUpperCase())?.n) })),
  };
}

export type FileFilter = "all" | "lms" | "students" | "hidden";

export async function courseFiles(code: string, now = new Date()) {
  const [courseRows, lms, studentFiles] = await Promise.all([
    db().select({ id: lmsCourses.id, code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses).where(eq(lmsCourses.code, code)).orderBy(desc(lmsCourses.fetchedAt)),
    db()
      .select({ id: lmsFiles.id, name: lmsFiles.name, extension: lmsFiles.extension, fetchedAt: lmsFiles.fetchedAt, o: fileOverrides })
      .from(lmsFiles)
      .leftJoin(fileOverrides, eq(fileOverrides.fileId, lmsFiles.id))
      .where(eq(lmsFiles.code, code)),
    db()
      .select({ id: uploads.id, title: uploads.title, type: uploads.type, week: uploads.week, status: uploads.status, showName: uploads.showName, sourceLabel: uploads.sourceLabel, uploaderId: uploads.uploaderId, createdAt: uploads.createdAt, opens: uploads.opens, name: lmsCache.data })
      .from(uploads)
      .leftJoin(lmsCache, eq(lmsCache.userId, uploads.uploaderId))
      .where(and(eq(uploads.courseCode, code), inArray(uploads.status, ["live", "hidden"]))),
  ]);
  const people = await teacherNamesByCode();
  const course = courseRows[0];
  if (!course) return null;
  const today = localDay(now);
  const added = (d: Date) => (localDay(d) === today ? "today" : `${Number(localDay(d).slice(8))} ${MONTHS[Number(localDay(d).slice(5, 7)) - 1].slice(0, 3)}`);
  const files = [
    ...lms.map((f) => {
      const meta = describeFile(f.name, { courseCode: code, courseName: course.name, extension: f.extension ?? undefined, teachers: people[code ?? ""] });
      const type = (f.o?.type as FileType | null) ?? meta.type;
      return { key: `lms:${f.id}`, source: "lms" as const, id: f.id, title: f.o?.title ?? meta.title, type, typeLabel: TYPE_LABEL[type] ?? type, week: f.o?.week ?? meta.week, hidden: !!f.o?.hidden, from: "LMS", fromStudents: false, added: added(f.fetchedAt), at: f.fetchedAt.getTime(), opens: null as number | null };
    }),
    ...studentFiles.map((u) => {
      const name = u.showName ? profileName(u.name) : null;
      const from = u.sourceLabel ? `From ${u.sourceLabel}` : name ? `From students · ${shortPerson(name)}` : "From students";
      return { key: `students:${u.id}`, source: "students" as const, id: u.id, title: u.title, type: u.type as FileType, typeLabel: TYPE_LABEL[u.type as FileType] ?? u.type, week: u.week, hidden: u.status === "hidden", from, fromStudents: true, added: added(u.createdAt), at: u.createdAt.getTime(), opens: u.opens };
    }),
  ].sort((a, b) => (a.week ?? 99) - (b.week ?? 99) || a.at - b.at);
  const visible = files.filter((f) => !f.hidden);
  return {
    code: course.code,
    name: course.name,
    files,
    counts: { all: visible.length, lms: visible.filter((f) => f.source === "lms").length, students: visible.filter((f) => f.source === "students").length, hidden: files.length - visible.length },
  };
}

const shortPerson = (full: string) => {
  const [given, ...rest] = full.split(/\s+/);
  return rest.length ? `${given} ${rest[rest.length - 1][0]}.` : given;
};

/* ───────── A6 Professors ───────── */

export async function professorsPage(tab: "duplicates" | "all", pair: string | undefined) {
  const [teachers, aliases, distinct, orphan] = await Promise.all([
    db().select({ id: lmsTeachers.id, firstName: lmsTeachers.firstName, lastName: lmsTeachers.lastName, surName: lmsTeachers.surName }).from(lmsTeachers),
    db().select({ oldId: teacherAliases.oldId }).from(teacherAliases),
    db().select({ target: adminMarks.target }).from(adminMarks).where(eq(adminMarks.kind, "teachers-distinct")),
    db().select({ n: sql<number>`count(distinct ${teacherRatings.teacherId})` }).from(teacherRatings).where(notInArray(teacherRatings.teacherId, db().select({ id: lmsTeachers.id }).from(lmsTeachers))),
  ]);
  const merged = new Set(aliases.map((a) => a.oldId));
  const current = teachers.filter((t) => !merged.has(t.id));
  const pairs = twins(current, new Set(distinct.map((d) => d.target)));
  const ids = tab === "duplicates" ? [...new Set(pairs.flat().map((t) => t.id))] : current.slice(0, 200).map((t) => t.id);
  const [courses, ratings, posts] = ids.length
    ? await Promise.all([
        db().select({ id: lmsCourseTeachers.teacherId, n: sql<number>`count(distinct ${lmsCourseTeachers.courseId})` }).from(lmsCourseTeachers).where(inArray(lmsCourseTeachers.teacherId, ids)).groupBy(lmsCourseTeachers.teacherId),
        db().select({ id: teacherRatings.teacherId, n: count() }).from(teacherRatings).where(inArray(teacherRatings.teacherId, ids)).groupBy(teacherRatings.teacherId),
        db().select({ id: mentionLinks.target, n: count() }).from(mentionLinks).where(and(eq(mentionLinks.kind, "teacher"), inArray(mentionLinks.target, ids))).groupBy(mentionLinks.target),
      ])
    : [[], [], []];
  const stat = (id: string) => ({ courses: n(courses.find((c) => c.id === id)?.n), ratings: n(ratings.find((c) => c.id === id)?.n), posts: n(posts.find((c) => c.id === id)?.n) });
  const card = (t: { id: string; firstName: string | null; lastName: string | null; surName: string | null }) => ({ id: t.id, name: displayName({ first_name_en: t.firstName, last_name_en: t.lastName, sur_name_en: t.surName }), ...stat(t.id) });
  const dupes = pairs.map(([a, b]) => {
    const [keep, merge] = stat(a.id).ratings >= stat(b.id).ratings ? [card(a), card(b)] : [card(b), card(a)];
    return { key: `${keep.id}|${merge.id}`, keep, merge, why: keep.name === merge.name ? "Same name · 2 Press F pages" : "Same surname and initial · different spelling" };
  });
  const selected = dupes.find((d) => d.key === pair || d.key.split("|").reverse().join("|") === pair) ?? dupes[0] ?? null;
  let doubles = 0;
  if (selected) {
    const res = await db().execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select cr.rater, tr.role from ${teacherRatings} tr join ${courseRatings} cr on cr.id = tr.rating_id
        where tr.teacher_id in (${selected.keep.id}, ${selected.merge.id})
        group by cr.rater, tr.role having count(distinct tr.teacher_id) > 1
      ) d`);
    doubles = n(res.rows[0]?.n);
  }
  return {
    tab,
    total: current.length,
    orphans: n(orphan[0]?.n),
    duplicates: dupes,
    all: tab === "all" ? current.slice(0, 200).map(card).sort((a, b) => a.name.localeCompare(b.name)) : [],
    selected: selected ? { ...selected, after: { name: selected.keep.name, ratings: selected.keep.ratings + selected.merge.ratings - doubles, doubles } } : null,
  };
}

/* ───────── A7 People ───────── */

export async function peoplePage(q: string, selectedId: string | undefined, now = new Date(), sort: Sort<PeopleSort> = null) {
  const uploadsOf = (status: UploadStatus) => sql`(select count(*) from ${uploads} where ${uploads.uploaderId} = ${users.id} and ${uploads.status} = ${status})`;
  // Same rule as trustOf(): manual trust wins, else 5 live and none rejected is trusted. Most trusted first.
  const trustRank = sql`case coalesce(${userRoles.manualTrust}::text, case when ${uploadsOf("live")} >= 5 and ${uploadsOf("rejected")} = 0 then 'trusted' else 'normal' end) when 'trusted' then 0 when 'normal' then 1 else 2 end`;
  const term = q.trim();
  const like = `%${term}%`;
  const where = term
    ? or(ilike(users.email, like), ilike(users.telegramId, like), ilike(lmsAccounts.lmsUserId, like), sql`${lmsCache.data}->'profile'->>'name' ilike ${like}`)
    : undefined;
  const [rows, totals] = await Promise.all([
    db()
      .select({ id: users.id, email: users.email, group: users.group, telegramId: users.telegramId, data: lmsCache.data, role: userRoles.role, manual: userRoles.manualTrust })
      .from(users)
      .leftJoin(lmsCache, eq(lmsCache.userId, users.id))
      .leftJoin(lmsAccounts, eq(lmsAccounts.userId, users.id))
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .where(where)
      .orderBy(...(sort ? [orderBy(sort, { student: personNameSql(), uploads: uploadsOf("live"), trust: trustRank }), desc(users.createdAt)] : [desc(users.createdAt)]))
      .limit(50),
    db().select({ n: count() }).from(users),
  ]);
  const ids = rows.map((r) => r.id);
  const hist = ids.length ? await db().select({ id: uploads.uploaderId, status: uploads.status, n: count() }).from(uploads).where(inArray(uploads.uploaderId, ids)).groupBy(uploads.uploaderId, uploads.status) : [];
  const people = rows.map((r) => {
    const of = (s: UploadStatus) => n(hist.find((h) => h.id === r.id && h.status === s)?.n);
    const p = personLabel(r.email, r.data);
    const live = of("live");
    const rejected = of("rejected");
    return {
      id: r.id,
      name: p.name,
      short: `${shortPerson(p.name)}${p.year ? ` · Y${p.year}` : ""}${r.group ? ` ${r.group}` : ""}`,
      uploads: [live ? `${live} live` : null, rejected ? `${rejected} no` : null].filter(Boolean).join(" · ") || "0",
      trust: trustOf({ live, rejected, manualTrust: r.manual }),
      manual: r.manual,
      role: r.role ?? "student",
    };
  });
  const trustedCount = await db()
    .select({ n: count() })
    .from(userRoles)
    .where(eq(userRoles.manualTrust, "trusted"));
  const sel = people.find((p) => p.id === selectedId) ?? people[0] ?? null;
  let detail = null;
  if (sel) {
    const [[u], [acct], [cache], ratingsGiven, [state]] = await Promise.all([
      db().select({ email: users.email, telegramId: users.telegramId, createdAt: users.createdAt, group: users.group }).from(users).where(eq(users.id, sel.id)),
      db().select({ lmsUserId: lmsAccounts.lmsUserId, status: lmsAccounts.status, lastUsedAt: lmsAccounts.lastUsedAt }).from(lmsAccounts).where(eq(lmsAccounts.userId, sel.id)),
      db().select({ data: lmsCache.data, syncedAt: lmsCache.syncedAt, snapshotAt: snapshotAt(sql`${userState.snapshot}->'lms'->>'at'`) }).from(lmsCache).leftJoin(userState, eq(userState.userId, lmsCache.userId)).where(eq(lmsCache.userId, sel.id)),
      db().select({ n: count() }).from(courseRatings).where(eq(courseRatings.rater, pseudonym(sel.id, "rater"))),
      db().select({ at: adminMarks.at }).from(adminMarks).where(and(eq(adminMarks.kind, "signout"), eq(adminMarks.target, sel.id))),
    ]);
    const p = personLabel(u.email, cache?.data);
    const since = `${Number(localDay(u.createdAt).slice(8))} ${MONTHS[Number(localDay(u.createdAt).slice(5, 7)) - 1].slice(0, 3)}`;
    detail = {
      id: sel.id,
      name: p.name,
      initials: p.initials,
      line: [u.telegramId ? `Telegram linked` : null, acct?.lmsUserId ? `LMS ${acct.lmsUserId}` : null, p.year ? `Year ${p.year}` : null, u.group].filter(Boolean).join(" · "),
      signedIn: `since ${since}${acct?.lastUsedAt ? ` · last seen ${age(acct.lastUsedAt, now)} ago` : ""}`,
      lms: acct ? (acct.status === "active" ? `OK · ${cache ? `synced ${age(newest(cache.syncedAt, cache.snapshotAt) ?? cache.syncedAt, now)} ago` : "not synced yet"}` : "Password changed — waiting for a new sign-in") : "Not linked",
      bot: u.telegramId ? "Linked" : "Not linked",
      ratings: `${n(ratingsGiven[0]?.n)} given (content private)`,
      signedOutAt: state?.at ?? null,
      trust: sel.trust,
      role: sel.role,
      canMessage: !!u.telegramId,
    };
  }
  return { q: term, sort, people, selectedId: sel?.id ?? null, detail, total: n(totals[0]?.n), trusted: n(trustedCount[0]?.n) };
}

/* ───────── A8 Broadcasts ───────── */

/** "Fall 2026" for the semester running at `now` (Aug–Jan fall, Feb–Jul spring). */
export function termAt(now: Date) {
  const [y, m] = localDay(now).split("-").map(Number);
  return m >= 8 ? `Fall ${y}` : m === 1 ? `Fall ${y - 1}` : `Spring ${y}`;
}

/** Students and bot-reachable students for an audience. Counts only. */
export async function audienceSize(a: Audience, now = new Date()) {
  const rows = await db().select({ id: users.id, telegramId: users.telegramId, data: lmsCache.data }).from(users).leftJoin(lmsCache, eq(lmsCache.userId, users.id));
  let raters: Set<string> | null = null;
  if (a.unrated) {
    const r = await db().selectDistinct({ rater: courseRatings.rater }).from(courseRatings).where(eq(courseRatings.term, a.unrated));
    raters = new Set(r.map((x) => x.rater));
  }
  const matches = rows.filter((r) => {
    const data = r.data as CacheData | null;
    if (a.years?.length) {
      const y = yearOf(semesterCount(data));
      if (!y || !a.years.includes(y)) return false;
    }
    if (a.courseIds?.length && !(data?.enrollment?.codes ?? []).some((c) => a.courseIds!.includes(c))) return false;
    if (raters && raters.has(pseudonym(r.id, "rater"))) return false;
    return true;
  });
  void now;
  return { students: matches.length, reachable: matches.filter((r) => r.telegramId).length };
}

export async function broadcastsPage(now = new Date()) {
  const [recent, size, courses] = await Promise.all([
    db().select().from(broadcasts).orderBy(desc(broadcasts.sendAt)).limit(6),
    audienceSize({}, now),
    db().selectDistinctOn([lmsCourses.code], { code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses).orderBy(lmsCourses.code).limit(400),
  ]);
  return {
    term: termAt(now),
    everyone: size,
    courses,
    recent: recent.map((b) => ({
      id: b.id,
      text: b.text,
      audience: audienceLabel(b.audience),
      when: b.sentAt ? `sent ${ago(b.sentAt, now)}` : `${b.sendAt > now ? "scheduled" : "due"} ${localDay(b.sendAt)}`,
      delivered: b.stats.delivered ?? b.stats.targeted ?? null,
      opened: b.stats.opened != null && b.stats.delivered ? `${Math.round((b.stats.opened / b.stats.delivered) * 100)}%` : "—",
      openedPct: b.stats.opened != null && b.stats.delivered ? b.stats.opened / b.stats.delivered : null,
    })),
  };
}

/* ───────── A9 Audit log ───────── */

export const ACTION_LABEL: Record<string, string> = {
  "upload.publish": "Published upload",
  "upload.reject": "Not accepted",
  "upload.hide": "Hid upload",
  "report.hidden": "Hid post",
  "report.kept": "Kept after report",
  "post.mute": "Muted author",
  "mention.link.hide": "Hid Anonymous link",
  "mention.link.restore": "Restored Anonymous link",
  "file.edit": "Edited file",
  "file.move": "Moved files",
  "file.hide": "Hid files",
  "file.show": "Showed files",
  "teacher.merge": "Merged professors",
  "teacher.distinct": "Not the same person",
  "trust.change": "Trust changed",
  "role.change": "Role changed",
  "user.signout": "Signed out everywhere",
  "user.message": "Messaged in bot",
  "broadcast.schedule": "Broadcast scheduled",
  "job.run": "Ran job",
  "setting.on": "Turned on",
  "setting.off": "Turned off",
};

export function describeAudit(action: string, target: string | null, d: Record<string, unknown>) {
  const s = (k: string) => (d[k] == null ? "" : String(d[k]));
  switch (action) {
    case "upload.publish": return s("title");
    case "upload.reject": return [s("title"), reasonLabelReject(s("reason"))].filter(Boolean).join(" · ");
    case "trust.change": return `${cap(s("from"))} → ${cap(s("to"))}`;
    case "role.change": return `→ ${cap(s("to"))}`;
    case "teacher.merge": return `${s("merged")} → ${target?.replace("teacher:", "")}`;
    case "post.mute": return `author muted ${s("days")} days`;
    case "mention.link.hide":
    case "mention.link.restore": return `${target ?? ""} · ${s("kind")} ${s("target")}`;
    case "broadcast.schedule": return s("text");
    case "file.move": return `${s("count")} files → week ${s("week") || "none"}`;
    case "file.hide":
    case "file.show": return `${s("count")} files`;
    case "file.edit": return Object.keys(d).filter((k) => k !== "fields").map((k) => `${k}: ${s(k)}`).join(" · ");
    default: return target ?? "";
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const REJECT_LABELS: Record<string, string> = { "in-lms": "Already in LMS", "live-exam": "Exam still running", "personal-data": "Has personal data", "wrong-course": "Wrong course", unreadable: "Can't read it", other: "Other" };
const reasonLabelReject = (r: string) => REJECT_LABELS[r] ?? r;

/** Lower-cased display name of a person (profile name, else the email's name part); null for no account. */
const personNameSql = () => sql`lower(coalesce(${lmsCache.data}->'profile'->>'name', split_part(${users.email}, '@', 1)))`;

export async function auditPage(filter: { actor?: string; action?: string }, now = new Date(), limit = 200, sort: Sort<AuditSort> = null) {
  const actionLabel = sql`lower(case ${auditLog.action} ${sql.join(Object.entries(ACTION_LABEL).map(([k, v]) => sql`when ${k}::text then ${v}::text`), sql` `)} else ${auditLog.action} end)`;
  const where = and(filter.actor ? eq(auditLog.actorId, filter.actor) : undefined, filter.action ? eq(auditLog.action, filter.action) : undefined);
  const [rows, actors, actions] = await Promise.all([
    db()
      .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, target: auditLog.target, detail: auditLog.detail, actorId: auditLog.actorId, email: users.email, data: lmsCache.data, role: userRoles.role })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .leftJoin(lmsCache, eq(lmsCache.userId, auditLog.actorId))
      .leftJoin(userRoles, eq(userRoles.userId, auditLog.actorId))
      .where(where)
      .orderBy(...(sort ? [orderBy(sort, { when: sql`${auditLog.at}`, who: personNameSql(), action: actionLabel }), desc(auditLog.at)] : [desc(auditLog.at)]))
      .limit(limit),
    db().selectDistinct({ id: auditLog.actorId, email: users.email, data: lmsCache.data }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).leftJoin(lmsCache, eq(lmsCache.userId, auditLog.actorId)),
    db().selectDistinct({ action: auditLog.action }).from(auditLog),
  ]);
  const today = localDay(now);
  const yesterday = localDay(new Date(now.getTime() - DAY_MS));
  const who = (email: string | null, data: unknown, role?: string | null) =>
    email ? `${shortPerson(personLabel(email, data).name)}${role === "moderator" ? " (mod)" : ""}` : "System";
  return {
    filter,
    sort,
    actors: actors.filter((a) => a.id).map((a) => ({ id: a.id!, name: who(a.email, a.data) })),
    actions: actions.map((a) => ({ id: a.action, label: ACTION_LABEL[a.action] ?? a.action })),
    rows: rows.map((r) => {
      const day = localDay(r.at);
      return {
        id: r.id,
        at: r.at.toISOString(),
        when: day === today ? toClock(r.at) : day === yesterday ? "Yesterday" : `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1].slice(0, 3)}`,
        who: who(r.email, r.data, r.role),
        action: ACTION_LABEL[r.action] ?? r.action,
        what: describeAudit(r.action, r.target, r.detail),
      };
    }),
  };
}
const toClock = (d: Date) => new Date(d.getTime() + 5 * HOUR).toISOString().slice(11, 16);

/* ───────── A10 System ───────── */

export async function systemPage(now = new Date()) {
  const [h, waiting] = await Promise.all([health(now), syllabusQueueItems()]);
  return {
    syllabusQueue: waiting.map((item) => ({ ...item, queuedText: ago(new Date(item.createdAt), now) })),
    jobs: h.jobs.map(({ lastRun, ...j }) => ({ ...j, lastRun: lastRun?.toISOString() ?? null })),
    lms: { api: process.env.LMS_API_URL?.replace(/^https?:\/\//, "") ?? "api.newuzbekistan.hero.study", signIns: h.signIns, syncPaused: h.settings["sync-paused"] },
    bot: { delivered: h.delivered, linked: h.linked },
    maintenance: h.settings.maintenance,
  };
}
