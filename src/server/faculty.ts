/**
 * Imports office, email, position, department and school for professors from
 * the university's public faculty kiosk (interactive.newuu.uz/faculty) and links
 * each person to an LMS teacher by name. Runs in the weekly harvest and from the
 * admin ("Import from newuu.uz now").
 *
 * Polite: one request at a time with a pause, a User-Agent naming Press F and a
 * timeout. Any failed request keeps the previous data. The `photo` field is never
 * read or stored (Press F shows drawn faces only).
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { clean, cleanEmail, groupDepartments, matchPeople, parseDepartments, tidyName, type SiteUnit } from "@/core/faculty";
import { db } from "@/lib/db";
import { adminMarks, facultyPeople, lmsTeachers, teacherAliases } from "@/lib/db/schema";
import { invalidate, TAGS } from "@/server/views/cache";

export const FACULTY_BASE = "https://interactive.newuu.uz";
const USER_AGENT = "PressF/2.0 (+https://pressf.chebarash.uz; weekly professor directory sync)";
const TIMEOUT_MS = 15_000;
const PAUSE_MS = 400;

export type ImportSummary = {
  ok: boolean;
  /** Site people now linked to an LMS teacher (auto + by hand). */
  matched: number;
  /** Linked professors whose imported profile changed in this run. */
  updated: number;
  /** Site people with no teacher yet (not dismissed). */
  unmatched: number;
  people: number;
  departments: number;
  /** Requests that failed; their previous data was kept. */
  failed: number;
  error?: string;
  at: string;
};

type Fetch = typeof fetch;
export type ImportOptions = { fetch?: Fetch; pauseMs?: number; base?: string };

const pause = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

async function get(f: Fetch, url: string, as: "text" | "json"): Promise<unknown> {
  const res = await f(url, { headers: { "user-agent": USER_AGENT, accept: as === "json" ? "application/json" : "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return as === "json" ? res.json() : res.text();
}

type Listed = { siteId: number; name: string; unit: SiteUnit };
const RANK = { department: 0, school: 1, other: 2 } as const;

let running: Promise<ImportSummary> | null = null;

/** One import at a time per process; a second call joins the running one. */
export function importFaculty(opts: ImportOptions = {}): Promise<ImportSummary> {
  running ??= runImport(opts).finally(() => {
    running = null;
  });
  return running;
}

async function runImport(opts: ImportOptions): Promise<ImportSummary> {
  const f = opts.fetch ?? fetch;
  const base = opts.base ?? FACULTY_BASE;
  const wait = opts.pauseMs ?? PAUSE_MS;
  let failed = 0;

  let units: SiteUnit[];
  try {
    units = groupDepartments(parseDepartments(String(await get(f, `${base}/faculty`, "text"))));
    if (!units.length) throw new Error("no departments on the faculty page");
  } catch (e) {
    // Nothing fetched: everything stays as it was.
    const summary = { ...(await counts()), ok: false, updated: 0, people: 0, departments: 0, failed: 1, error: e instanceof Error ? e.message : String(e), at: new Date().toISOString() };
    await saveSummary(summary);
    return summary;
  }

  // Everyone listed, each under their most specific listing (a department over a school or the deans).
  const listed = new Map<number, Listed>();
  for (const unit of units) {
    await pause(wait);
    try {
      const rows = (await get(f, `${base}/get-professors/${unit.id}`, "json")) as Array<{ id?: unknown; name?: unknown }>;
      for (const r of Array.isArray(rows) ? rows : []) {
        const siteId = Number(r.id);
        const name = clean(r.name);
        if (!Number.isInteger(siteId) || siteId <= 0 || !name) continue;
        const seen = listed.get(siteId);
        if (!seen || RANK[unit.kind] < RANK[seen.unit.kind]) listed.set(siteId, { siteId, name, unit });
      }
    } catch {
      failed++;
    }
  }

  const previous = new Map((await db().select().from(facultyPeople)).map((p) => [p.siteId, p]));
  const changedTeachers = new Set<string>();
  for (const l of listed.values()) {
    await pause(wait);
    const before = previous.get(l.siteId);
    let detail: Record<string, unknown> | null = null;
    try {
      const d = await get(f, `${base}/get-professor-details/${l.unit.id}/${l.siteId}`, "json");
      if (d && typeof d === "object" && !Array.isArray(d)) detail = d as Record<string, unknown>;
      else throw new Error("bad detail");
    } catch {
      failed++;
    }
    if (!detail && before) continue; // keep the previous values
    // Only these fields are read; `photo` is ignored on purpose.
    const department = l.unit.kind === "department" ? l.unit.name : clean(detail?.department) ?? (l.unit.kind === "other" ? l.unit.name : null);
    const row = {
      siteId: l.siteId,
      siteDepartmentId: l.unit.id,
      name: tidyName(clean(detail?.fullName) ?? l.name),
      position: clean(detail?.position, 120),
      department: department && department !== l.unit.school ? department : null,
      school: l.unit.school,
      office: clean(detail?.office, 40),
      email: cleanEmail(detail?.email),
      fetchedAt: new Date(),
    };
    if (before && before.teacherId && (["name", "position", "department", "school", "office", "email"] as const).some((k) => before[k] !== row[k])) changedTeachers.add(before.teacherId);
    await db()
      .insert(facultyPeople)
      .values(row)
      .onConflictDoUpdate({
        target: facultyPeople.siteId,
        set: { siteDepartmentId: row.siteDepartmentId, name: row.name, position: row.position, department: row.department, school: row.school, office: row.office, email: row.email, fetchedAt: row.fetchedAt },
      });
  }

  const linked = await relink();
  for (const id of linked) changedTeachers.add(id);
  const summary: ImportSummary = { ...(await counts()), ok: failed === 0, updated: changedTeachers.size, people: listed.size, departments: units.length, failed, at: new Date().toISOString() };
  await saveSummary(summary);
  if (changedTeachers.size) invalidate(TAGS.catalog, ...[...changedTeachers].map(TAGS.teacher));
  return summary;
}

/**
 * Re-runs the name matcher for every person not linked or dismissed by hand.
 * Returns the teachers whose link changed (gained or lost a person).
 */
export async function relink(): Promise<string[]> {
  const [people, teachers, aliases] = await Promise.all([
    db().select().from(facultyPeople),
    db().select({ id: lmsTeachers.id, firstName: lmsTeachers.firstName, lastName: lmsTeachers.lastName, surName: lmsTeachers.surName }).from(lmsTeachers),
    db().select({ oldId: teacherAliases.oldId }).from(teacherAliases),
  ]);
  const merged = new Set(aliases.map((a) => a.oldId));
  const current = teachers.filter((t) => !merged.has(t.id));
  const fixed = people.filter((p) => p.match === "manual" || p.match === "dismissed");
  const taken = new Set(fixed.map((p) => p.teacherId).filter((id): id is string => !!id));
  const open = people.filter((p) => p.match !== "manual" && p.match !== "dismissed");
  const results = matchPeople(open.map((p) => ({ siteId: p.siteId, name: p.name, email: p.email })), current, taken);
  const changed: string[] = [];
  for (const r of results) {
    const p = open.find((x) => x.siteId === r.siteId)!;
    const match = r.teacherId ? "auto" : "none";
    if (p.teacherId === r.teacherId && p.match === match && JSON.stringify(p.candidates) === JSON.stringify(r.candidates)) continue;
    if (p.teacherId !== r.teacherId) changed.push(...[p.teacherId, r.teacherId].filter((x): x is string => !!x));
    await db().update(facultyPeople).set({ teacherId: r.teacherId, match, candidates: r.candidates }).where(eq(facultyPeople.siteId, r.siteId));
  }
  return [...new Set(changed)];
}

async function counts() {
  const [row] = await db()
    .select({
      matched: sql<number>`count(*) filter (where ${facultyPeople.teacherId} is not null)::int`,
      unmatched: sql<number>`count(*) filter (where ${facultyPeople.teacherId} is null and ${facultyPeople.match} <> 'dismissed')::int`,
    })
    .from(facultyPeople);
  return { matched: Number(row?.matched ?? 0), unmatched: Number(row?.unmatched ?? 0) };
}

const SUMMARY_KIND = "import";
const SUMMARY_TARGET = "newuu";

async function saveSummary(summary: ImportSummary) {
  await db()
    .insert(adminMarks)
    .values({ kind: SUMMARY_KIND, target: SUMMARY_TARGET, data: summary, at: new Date() })
    .onConflictDoUpdate({ target: [adminMarks.kind, adminMarks.target], set: { data: summary, at: new Date() } });
}

/** The last import's summary, for the admin. */
export async function lastImport(): Promise<ImportSummary | null> {
  const [row] = await db().select({ data: adminMarks.data }).from(adminMarks).where(and(eq(adminMarks.kind, SUMMARY_KIND), eq(adminMarks.target, SUMMARY_TARGET)));
  return (row?.data as ImportSummary | undefined) ?? null;
}

/** Imported profile per teacher (the linked site person). */
export async function importedFor(teacherIds: string[]) {
  const ids = [...new Set(teacherIds.filter(Boolean))];
  if (!ids.length) return new Map<string, typeof facultyPeople.$inferSelect>();
  const rows = await db().select().from(facultyPeople).where(inArray(facultyPeople.teacherId, ids));
  return new Map(rows.map((r) => [r.teacherId!, r]));
}

/** Site people still waiting for a teacher (not dismissed). */
export const unmatchedPeople = () =>
  db()
    .select()
    .from(facultyPeople)
    .where(and(sql`${facultyPeople.teacherId} is null`, notInArray(facultyPeople.match, ["dismissed"])))
    .orderBy(facultyPeople.name);
