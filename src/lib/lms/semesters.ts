import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsSemesters, type LmsSemesterPhase } from "@/lib/db/schema";
import { semesterCalendar, semesterList, type LmsSession } from "@/lib/lms/client";

/**
 * Semesters shared by every student: their LMS names (so a course term never
 * shows as "Semester 8") and the semester calendar phases (cohort selection,
 * schedule builder, studies, add/drop). Filled by the harvest and the
 * per-student sync; views read the table only.
 */

/** Re-fetch a semester's calendar at most this often. */
export const CALENDAR_TTL_MS = 24 * 3600_000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** First non-empty string among `keys`; `{ name }` objects count as their name. */
export function pick(o: Obj, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (isObj(v)) {
      const n = pick(v, ["name_en", "name", "title"]);
      if (n) return n;
    }
  }
  return null;
}

/** The array inside an LMS payload: the payload itself or its first array field (`data`, `items`…). */
export function listOf(payload: unknown, keys = ["data", "items", "list", "semesters", "calendar", "result"]): Obj[] {
  if (Array.isArray(payload)) return payload.filter(isObj);
  if (!isObj(payload)) return [];
  for (const k of keys) if (Array.isArray(payload[k])) return (payload[k] as unknown[]).filter(isObj);
  for (const k of keys) if (isObj(payload[k])) return listOf(payload[k], keys);
  return [];
}

/** Unix seconds/ms, "YYYY-MM-DD[ HH:mm[:ss]]" or "DD.MM.YYYY[ HH:mm]" in Tashkent → Date. */
export function lmsDate(v: unknown, endOfDay = false): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isFinite(n)) return n > 0 ? new Date(n < 1e12 ? n * 1000 : n) : null;
  let s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/);
  if (dmy) s = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}${dmy[4]}`;
  s = s.replace(" ", "T");
  if (/^\d{4}-\d\d-\d\d$/.test(s)) s += endOfDay ? "T23:59:59" : "T00:00:00";
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}+05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function phaseKind(name: string): LmsSemesterPhase["kind"] {
  const t = name.toLowerCase();
  if (/add.?\s*\/?\s*drop/.test(t)) return "add-drop";
  if (/cohort|stream/.test(t)) return "cohort-selection";
  if (/schedule|builder|timetable/.test(t)) return "schedule-builder";
  if (/stud|teach|class|lesson/.test(t)) return "studies";
  return "other";
}

const NAME_KEYS = ["name_en", "name", "title", "stage", "type_name", "type", "event_type", "calendar_type", "semesterCalendarType"];
const START_KEYS = ["begin_date", "start_date", "date_start", "date_begin", "begin_time", "start_time", "start", "begin", "from", "date_from"];
const END_KEYS = ["end_date", "finish_date", "date_end", "date_finish", "end_time", "finish_time", "end", "finish", "to", "date_to"];

/** `/semester/calendar` → phases with ISO dates; rows without a name or dates are dropped. */
export function parseCalendar(payload: unknown): LmsSemesterPhase[] {
  const rows = listOf(payload);
  // Some payloads key phases by name: { "Cohorts selection": { begin, end } }.
  const keyed = !rows.length && isObj(payload) ? Object.entries(payload).filter(([, v]) => isObj(v)).map(([k, v]) => ({ name: k, ...(v as Obj) })) : [];
  const out: LmsSemesterPhase[] = [];
  for (const r of [...rows, ...keyed]) {
    const name = pick(r, NAME_KEYS);
    const starts = lmsDate(pick(r, START_KEYS));
    const ends = lmsDate(pick(r, END_KEYS), true) ?? starts;
    if (!name || !starts || !ends) continue;
    out.push({ kind: phaseKind(name), name, starts: starts.toISOString(), ends: ends.toISOString() });
  }
  return out.sort((a, b) => a.starts.localeCompare(b.starts));
}

export type SemesterRow = { id: string; name: string | null; starts: string | null; ends: string | null };

const day = (v: unknown) => {
  const d = lmsDate(v);
  return d ? new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10) : null;
};

/** `/semester/semester-list` (or my-list / gradebook semesters) → id, name and study dates. */
export function parseSemesters(payload: unknown): SemesterRow[] {
  return listOf(payload)
    .map((r) => ({
      id: pick(r, ["semester_id", "id"]) ?? "",
      name: pick(r, ["semester_name", "name_en", "name"]),
      starts: day(pick(r, ["study_start", "begin_date", "start_date", "date_start", "begin"])),
      ends: day(pick(r, ["study_end", "end_date", "finish_date", "date_end", "end"])),
    }))
    .filter((r) => r.id);
}

/** Upserts semester names and dates; never blanks a known value with an empty one. */
export async function saveSemesters(rows: SemesterRow[]) {
  const unique = [...new Map(rows.filter((r) => r.id).map((r) => [r.id, r])).values()];
  if (!unique.length) return 0;
  await db().insert(lmsSemesters).values(unique.map((r) => ({ ...r, updatedAt: new Date() }))).onConflictDoUpdate({
    target: lmsSemesters.id,
    set: {
      name: sql`coalesce(excluded.name, ${lmsSemesters.name})`,
      starts: sql`coalesce(excluded.starts, ${lmsSemesters.starts})`,
      ends: sql`coalesce(excluded.ends, ${lmsSemesters.ends})`,
      updatedAt: sql`excluded.updated_at`,
    },
  });
  return unique.length;
}

/**
 * Fetches the calendar of each semester whose stored copy is missing or older
 * than the TTL. Shared: one student's sync fills it for everyone.
 */
export async function refreshCalendars(session: LmsSession, ids: string[], now = new Date()) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return 0;
  const have = await db().select({ id: lmsSemesters.id, at: lmsSemesters.calendarFetchedAt }).from(lmsSemesters).where(inArray(lmsSemesters.id, unique));
  const fresh = new Set(have.filter((r) => r.at && now.getTime() - r.at.getTime() < CALENDAR_TTL_MS).map((r) => r.id));
  let fetched = 0;
  for (const id of unique.filter((x) => !fresh.has(x))) {
    try {
      const calendar = parseCalendar(await semesterCalendar(session, id));
      await db().insert(lmsSemesters).values({ id, calendar, calendarFetchedAt: now, updatedAt: now }).onConflictDoUpdate({
        target: lmsSemesters.id,
        // An empty answer keeps the last good calendar but still counts as fetched.
        set: { calendar: calendar.length ? calendar : sql`${lmsSemesters.calendar}`, calendarFetchedAt: now, updatedAt: now },
      });
      fetched++;
    } catch {
      // One semester failing must not stop the rest.
    }
  }
  return fetched;
}

/** Ids of the open semester and the ones after it that we know of: the calendars that matter. */
export async function upcomingSemesterIds(openIds: string[], limit = 3): Promise<string[]> {
  const rows = await db().select({ id: lmsSemesters.id }).from(lmsSemesters);
  const floor = Math.min(...openIds.map(Number).filter(Number.isFinite), Infinity);
  const later = Number.isFinite(floor) ? rows.map((r) => r.id).filter((id) => Number(id) > floor).sort((a, b) => Number(a) - Number(b)) : [];
  return [...new Set([...openIds, ...later])].slice(0, limit);
}

/** Harvest: every semester's name, then the calendars of current and future ones. */
export async function harvestSemesters(session: LmsSession, now = new Date()) {
  let rows: SemesterRow[] = [];
  try {
    rows = parseSemesters(await semesterList(session));
  } catch {
    return { semesters: 0, calendars: 0 };
  }
  await saveSemesters(rows);
  const recent = rows.map((r) => r.id).sort((a, b) => Number(b) - Number(a)).slice(0, 3);
  const calendars = await refreshCalendars(session, recent, now);
  return { semesters: rows.length, calendars };
}
