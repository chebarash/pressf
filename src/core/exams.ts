import { addDays } from "./time";

/**
 * Exam schedules from university sheets. The tables change shape every time,
 * so a sheet is read in three steps, all deterministic:
 *
 *  1. every tab becomes a plain grid of strings (merged cells filled in);
 *  2. `analyse` recognises the common layouts and returns a MAPPING (which tab
 *     is which layout, where the header rows are, which columns hold the room,
 *     course, student id, day, slot and time). The mapping holds positions and
 *     header labels only, never a student's row, so it can be cached per source;
 *  3. `applyMapping` reads the exams through the mapping, resolving slot labels
 *     ("M-2", "Monday", "12:30 PM") to dates inside the exam window.
 *
 * Layouts:
 *  - slot_grid: rows are day × slot, columns are rooms, cells are courses
 *    ("MATH111 Calculus 1 (120 min)") with an optional seat count under each;
 *  - student_rows: one row per student (ID first), then for each slot a room
 *    and a course column;
 *  - course_list: one row per exam (or per student and exam) with course, date,
 *    time and room columns under a header row.
 *
 * Anything the analyser can't place is left to the operator path: the lead
 * reads the sheet and posts the normalised JSON (`ExamImport`).
 */

export type Grid = string[][];
export type Tab = { name: string; rows: Grid };

export type ExamKind = "midterm" | "final" | "exam";
export type ExamWindowInput = { name: string; starts: string; ends: string };

/** One exam of a course at one time, with every room it is written in. */
export type NormalExam = { code: string | null; name: string | null; date: string; start: string; minutes: number; rooms: string[]; seats: number | null };
/** One student's seat: where a student ID writes a course's exam. */
export type NormalSeat = { studentId: string; code: string | null; name: string | null; date: string; start: string; minutes: number | null; room: string | null };
export type Normalised = { exams: NormalExam[]; seats: NormalSeat[] };

/** Minutes when the sheet does not say ("(120 min)" marks the others). */
export const DEFAULT_MINUTES = 120;

/* ───────────── cells ───────────── */

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

const COURSE_RE = /\b([A-Z]{2,5})\s?-?\s?(\d{3}[A-Z]?)\b/g;
const MINUTES_RE = /\(?\s*(\d{2,3})\s*(?:min|mins|minutes|мин)\.?\s*\)?/i;
const HOURS_RE = /\(?\s*(\d(?:[.,]\d)?)\s*(?:h|hr|hrs|hours?)\b\.?\s*\)?/i;

/** "(120 min)", "90 minutes", "2 h" → minutes. */
export function minutesIn(text: string): number | null {
  const m = MINUTES_RE.exec(text);
  if (m) return Number(m[1]);
  const h = HOURS_RE.exec(text);
  return h ? Math.round(Number(h[1].replace(",", ".")) * 60) : null;
}

/** "CS 412" / "cs-412" → "CS412". */
export const normCode = (code: string) => code.toUpperCase().replace(/[\s-]+/g, "");

export type CourseCell = { code: string; name: string | null; minutes: number | null };

/**
 * Every course in a cell: "MATH111 Calculus 1 (120 min)", "CS412 Deep Learning / CS413 …".
 * A code is 2–5 capital letters and 3 digits; the name is the text after it.
 */
export function parseCourses(cell: string): CourseCell[] {
  const text = clean(cell);
  if (!text || text.length > 300) return [];
  const hits = [...text.matchAll(COURSE_RE)];
  // A room ("MATH 105", "UCA204") looks like a code; a room has no name after it and stands alone.
  if (!hits.length || (hits.length === 1 && isRoom(text))) return [];
  return hits.map((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const rest = text.slice(m.index + m[0].length, end);
    const minutes = minutesIn(rest);
    const name = rest.replace(MINUTES_RE, " ").replace(HOURS_RE, " ").replace(/^[\s\-–—:,.;/|]+|[\s\-–—:,.;/|(]+$/g, "").replace(/\s+/g, " ").trim();
    return { code: `${m[1]}${m[2]}`, name: name || null, minutes };
  });
}

/** A course name without a code ("Deep Learning (120 min)"), for list layouts that keep the code apart. */
export function parseCourseName(cell: string): { name: string; minutes: number | null } | null {
  const text = clean(cell);
  if (!text || /^\d+$/.test(text)) return null;
  return { name: text.replace(MINUTES_RE, " ").replace(/\s+/g, " ").trim(), minutes: minutesIn(text) };
}

const ROOM_RE = /^(?:[A-Z]{1,6}[ -]?[A-Z]?\d{1,4}[A-Z]?|[A-Z]{1,6}[ -][A-Z]\d{1,3}|[A-Za-z][A-Za-z ]{0,30}\b(?:hall|auditorium|aud\.?|lab|gym|room|library|atrium)\b[A-Za-z0-9 ]{0,10})$/i;

/** "MATH 105", "UCA204", "B14", "MATH-B01", "Conference Hall". */
export function isRoom(cell: string) {
  const t = clean(cell);
  return t.length >= 2 && t.length <= 40 && ROOM_RE.test(t) && /[A-Za-z]/.test(t) && !/^(mon|tue|wed|thu|fri|sat|sun)/i.test(t) && !/^(id|name|course|time|slots?|room|rooms|date|day)$/i.test(t) && !/^[A-Z]{1,2} ?- ?\d$/.test(t);
}

/** Room labels the way the timetable prints them: "UCA204" → "UCA 204", "MATH-B01" → "MATH B01". */
export function normRoom(cell: string): string {
  const t = clean(cell).replace(/\s*-\s*/g, " ");
  const m = /^([A-Za-z]{2,6}) ?([A-Za-z]?\d{1,4}[A-Za-z]?)$/.exec(t);
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : t;
}

/** Several rooms in one cell: "MATH 105, MATH 106; UCA 204". */
export const splitRooms = (cell: string) =>
  clean(cell)
    .split(/\s*[,;/\n]\s*|\s+&\s+|\s+and\s+/i)
    .map((r) => r.trim())
    .filter(Boolean)
    .map(normRoom);

/** "MATH 104, 105, 106, 110" → "MATH 104–106, 110" (runs of numbers per building). */
export function roomsLabel(rooms: string[]): string {
  const groups = new Map<string, Array<{ n: number; raw: string }>>();
  const loose: string[] = [];
  for (const r of [...new Set(rooms)]) {
    const m = /^(.*?)(\d+)$/.exec(r);
    if (!m) {
      loose.push(r);
      continue;
    }
    const list = groups.get(m[1]) ?? groups.set(m[1], []).get(m[1])!;
    list.push({ n: Number(m[2]), raw: m[2] });
  }
  const parts: string[] = [];
  for (const [prefix, list] of groups) {
    list.sort((a, b) => a.n - b.n);
    const runs: string[] = [];
    for (let i = 0; i < list.length; ) {
      let j = i;
      while (j + 1 < list.length && list[j + 1].n === list[j].n + 1) j++;
      runs.push(j > i ? `${list[i].raw}–${list[j].raw}` : list[i].raw);
      i = j + 1;
    }
    parts.push(`${prefix}${runs.join(", ")}`);
  }
  return [...parts, ...loose].join(", ");
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "9:45 AM", "12:30", "15.00", "3 PM", "09:45–11:45" → start (and end) as "HH:MM".
 * A bare 1–7 o'clock without AM/PM is afternoon (exams run 8:00–20:00).
 */
export function parseTime(cell: string): { start: string; end: string | null } | null {
  const text = clean(cell).toLowerCase().replace(/\./g, (m, i, s) => (/\d/.test(s[i - 1] ?? "") && /\d/.test(s[i + 1] ?? "") ? ":" : m));
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d/])/g;
  const found: Array<{ h: number; m: number; ap: string | null; colon: boolean }> = [];
  for (const m of text.matchAll(re)) {
    const h = Number(m[1]);
    const colon = m[2] !== undefined;
    const ap = m[3] ? m[3].replace(/\./g, "") : null;
    if (!colon && !ap) continue;
    if (h > 23 || Number(m[2] ?? 0) > 59) continue;
    found.push({ h, m: Number(m[2] ?? 0), ap, colon });
    if (found.length === 2) break;
  }
  if (!found.length) return null;
  const to24 = (t: (typeof found)[number], fallbackAp: string | null) => {
    const ap = t.ap ?? fallbackAp;
    let h = t.h;
    if (ap === "pm" && h < 12) h += 12;
    else if (ap === "am" && h === 12) h = 0;
    else if (!ap && h >= 1 && h <= 7) h += 12;
    return `${pad(h)}:${pad(t.m)}`;
  };
  const lastAp = found.at(-1)!.ap;
  const start = to24(found[0], found[0].ap ?? (found.length === 2 ? lastAp : null));
  const end = found.length === 2 ? to24(found[1], found[1].ap) : null;
  return { start, end: end && end > start ? end : null };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const WEEKDAYS: Array<[RegExp, number]> = [
  [/^(mon|monday|понедельник|dushanba)\b/i, 1],
  [/^(tue|tues|tuesday|вторник|seshanba)\b/i, 2],
  [/^(wed|wednesday|среда|chorshanba)\b/i, 3],
  [/^(thu|thur|thurs|thursday|четверг|payshanba)\b/i, 4],
  [/^(fri|friday|пятница|juma)\b/i, 5],
  [/^(sat|saturday|суббота|shanba)\b/i, 6],
  [/^(sun|sunday|воскресенье|yakshanba)\b/i, 0],
];
const SLOT_PREFIX: Record<string, number> = { M: 1, MO: 1, T: 2, TU: 2, W: 3, WE: 3, TH: 4, R: 4, F: 5, FR: 5, SA: 6, S: 6, SU: 0 };

/** The weekday (0 Sunday … 6 Saturday) a cell names: "Monday", "Tue", or a slot label "TH-2". */
export function weekdayIn(cell: string): number | null {
  const words = clean(cell).split(/[\s,;/|()]+/).filter(Boolean);
  for (const w of words) for (const [re, d] of WEEKDAYS) if (re.test(w)) return d;
  const slot = slotIn(cell);
  return slot ? slot.weekday : null;
}

/** "M-1", "TH-2", "W3" → the slot label and its weekday. */
export function slotIn(cell: string): { label: string; weekday: number | null } | null {
  const m = /(?:^|\s)([A-Z]{1,2})\s?-\s?(\d)(?=\s|$)/.exec(clean(cell)) ?? /^([A-Z]{1,2})(\d)$/.exec(clean(cell));
  if (!m) return null;
  return { label: `${m[1]}-${m[2]}`, weekday: SLOT_PREFIX[m[1]] ?? null };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date in a cell, read day-first: "2026-11-02", "02.11.2026", "2/11/2026",
 * "2 Nov", "Nov 2", "Monday, 2 November", or a spreadsheet serial (46328).
 * A date without a year takes the window's year.
 */
export function parseDate(cell: string, year: number): string | null {
  const text = clean(cell);
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/.exec(text);
  if (m && !/:/.test(text.slice(m.index, m.index + m[0].length))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    const out = valid(y, Number(m[2]), Number(m[1]));
    if (out && (m[3] || Number(m[2]) <= 12)) return out;
  }
  const lower = text.toLowerCase();
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?/.exec(lower);
  if (m && MONTHS.includes(m[2].slice(0, 3))) return valid(m[3] ? Number(m[3]) : year, MONTHS.indexOf(m[2].slice(0, 3)) + 1, Number(m[1]));
  m = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(lower);
  if (m && MONTHS.includes(m[1].slice(0, 3))) return valid(m[3] ? Number(m[3]) : year, MONTHS.indexOf(m[1].slice(0, 3)) + 1, Number(m[2]));
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 40000 && serial < 60000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}

function valid(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

/** The window's day for a weekday (0 Sunday … 6 Saturday); the first match when the window spans two weeks. */
export function dayInWindow(window: ExamWindowInput, weekday: number): string | null {
  for (let d = window.starts; d <= window.ends; d = addDays(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() === weekday) return d;
  return null;
}

/** University student IDs: "220066", "26M2607", "23B2057" (spreadsheets add ".0" to numbers). */
export const normStudentId = (cell: string) => clean(cell).replace(/\.0+$/, "").replace(/\s+/g, "").toUpperCase();
const ID_RE = /^(\d{5,8}|\d{2}[A-Z]{1,2}\d{3,5})$/;
export const isStudentId = (cell: string) => ID_RE.test(normStudentId(cell));

/* ───────────── labels: what a header or a row's left cells say ───────────── */

export type Label = { weekday: number | null; date: string | null; slot: string | null; time: string | null; end: string | null };

/** Day, date, slot and time from a few label cells ("Monday", "M-2", "12:30 PM"). */
export function readLabel(cells: string[], year: number): Label {
  const out: Label = { weekday: null, date: null, slot: null, time: null, end: null };
  for (const raw of cells) {
    const c = clean(raw);
    if (!c) continue;
    if (out.date === null) out.date = parseDate(c, year);
    if (out.slot === null) out.slot = slotIn(c)?.label ?? null;
    if (out.weekday === null) out.weekday = weekdayIn(c);
    if (out.time === null) {
      const t = parseTime(c.replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/, ""));
      if (t) {
        out.time = t.start;
        out.end = t.end;
      }
    }
  }
  if (out.weekday === null && out.date) out.weekday = new Date(`${out.date}T00:00:00Z`).getUTCDay();
  return out;
}

/* ───────────── mapping ───────────── */

export type Pair = { roomCol: number | null; courseCol: number; label: Label };

export type TabMapping =
  | { tab: string; layout: "slot_grid"; roomRow: number; roomCols: number[]; labelCols: number[]; dataFrom: number }
  | { tab: string; layout: "student_rows"; idCol: number; dataFrom: number; pairs: Pair[] }
  | {
      tab: string;
      layout: "course_list";
      headerRow: number;
      dataFrom: number;
      cols: { course: number; code?: number; date?: number; day?: number; time?: number; end?: number; duration?: number; room?: number; seats?: number; studentId?: number };
    };

export type Mapping = { v: 1; tabs: TabMapping[] };

const fill = (rows: Grid) => {
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: width }, (_, i) => clean(r[i])));
};

const ratio = (hits: number, all: number) => (all ? hits / all : 0);

function slotGrid(tab: Tab): TabMapping | null {
  const rows = fill(tab.rows);
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const roomCols = rows[r].map((c, i) => (isRoom(c) && !parseCourses(c).length ? i : -1)).filter((i) => i >= 0);
    if (roomCols.length < 3) continue;
    let courses = 0;
    for (let k = r + 1; k < Math.min(rows.length, r + 80); k++) for (const c of roomCols) if (parseCourses(rows[k][c]).length) courses++;
    if (courses < 3) continue;
    const first = Math.min(...roomCols);
    const labelCols = Array.from({ length: first }, (_, i) => i);
    return { tab: tab.name, layout: "slot_grid", roomRow: r, roomCols, labelCols, dataFrom: r + 1 };
  }
  return null;
}

function studentRows(tab: Tab, year: number): TabMapping | null {
  const rows = fill(tab.rows);
  if (rows.length < 3) return null;
  const width = rows[0]?.length ?? 0;
  let idCol = -1;
  let dataFrom = -1;
  for (let c = 0; c < Math.min(width, 6) && idCol < 0; c++) {
    const hits = rows.map((r, i) => (isStudentId(r[c]) ? i : -1)).filter((i) => i >= 0);
    if (hits.length >= 3 && ratio(hits.length, rows.length - hits[0]) >= 0.6) {
      idCol = c;
      dataFrom = hits[0];
    }
  }
  if (idCol < 0) return null;
  const data = rows.slice(dataFrom);
  const kind = (c: number) => {
    let course = 0, room = 0, all = 0;
    for (const r of data) {
      const v = r[c];
      if (!v) continue;
      all++;
      if (parseCourses(v).length) course++;
      else if (isRoom(v)) room++;
    }
    return { course: ratio(course, all), room: ratio(room, all), all };
  };
  const kinds = Array.from({ length: width }, (_, c) => (c === idCol ? { course: 0, room: 0, all: 0 } : kind(c)));
  const pairs: Pair[] = [];
  const used = new Set<number>();
  for (let c = 0; c < width; c++) {
    if (kinds[c].all === 0 || kinds[c].course < 0.7) continue;
    const roomCol = [c - 1, c + 1].find((x) => x >= 0 && x < width && x !== idCol && !used.has(x) && kinds[x].room >= 0.7 && kinds[x].course < 0.3) ?? null;
    if (roomCol !== null) used.add(roomCol);
    used.add(c);
    const header = rows.slice(0, dataFrom).flatMap((r) => [roomCol !== null ? r[roomCol] : "", r[c]]);
    pairs.push({ roomCol, courseCol: c, label: readLabel(header, year) });
  }
  return pairs.length ? { tab: tab.name, layout: "student_rows", idCol, dataFrom, pairs } : null;
}

const HEAD: Array<[keyof Extract<TabMapping, { layout: "course_list" }>["cols"], RegExp]> = [
  ["studentId", /\b(student\s*id|id\s*(number|no)?|student\s*no)\b/i],
  ["code", /\b(course\s*code|subject\s*code|code)\b/i],
  ["date", /\bdate\b/i],
  ["day", /\b(day|weekday)\b/i],
  ["end", /\b(end|ends|finish)\b/i],
  ["time", /\b(time|start|starts|begin)\b/i],
  ["duration", /\b(duration|length|minutes|mins?)\b/i],
  ["room", /\b(room|rooms|venue|auditorium|location|place|hall)\b/i],
  ["seats", /\b(seats|capacity|students|count|places)\b/i],
  ["course", /\b(course|subject|exam|module|discipline)\b/i],
];

function courseList(tab: Tab): TabMapping | null {
  const rows = fill(tab.rows);
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cols: Extract<TabMapping, { layout: "course_list" }>["cols"] = { course: -1 };
    rows[r].forEach((cell, i) => {
      if (!cell || cell.length > 40) return;
      for (const [key, re] of HEAD) {
        if (!re.test(cell)) continue;
        if (key === "course" && cols.course >= 0) break;
        if (key !== "course" && cols[key] !== undefined) break;
        (cols as Record<string, number>)[key] = i;
        break;
      }
    });
    if (cols.course < 0 && cols.code !== undefined) {
      cols.course = cols.code;
      delete cols.code;
    }
    if (cols.course < 0 || (cols.date === undefined && cols.day === undefined) || cols.time === undefined) continue;
    return { tab: tab.name, layout: "course_list", headerRow: r, dataFrom: r + 1, cols };
  }
  return null;
}

/** Recognises each tab's layout. Tabs it can't place are left out (listed in `skipped`). */
export function analyse(tabs: Tab[], window: ExamWindowInput): { mapping: Mapping; skipped: string[] } {
  const year = Number(window.starts.slice(0, 4));
  const out: TabMapping[] = [];
  const skipped: string[] = [];
  for (const tab of tabs) {
    const m = studentRows(tab, year) ?? slotGrid(tab) ?? courseList(tab);
    if (m) out.push(m);
    else skipped.push(tab.name);
  }
  return { mapping: { v: 1, tabs: out }, skipped };
}

/* ───────────── reading through a mapping ───────────── */

export class SheetError extends Error {}

type Raw = { code: string | null; name: string | null; label: Label; minutes: number | null; room: string | null; seats: number | null; studentId: string | null; where: string };

function placed(raw: Raw, window: ExamWindowInput, slotTimes: Map<string, { time: string; weekday: number | null; date: string | null }>, problems: string[]) {
  const slot = raw.label.slot ? slotTimes.get(raw.label.slot) : undefined;
  const time = raw.label.time ?? slot?.time ?? null;
  let date = raw.label.date ?? slot?.date ?? null;
  const weekday = raw.label.weekday ?? slot?.weekday ?? null;
  if (!date && weekday !== null) date = dayInWindow(window, weekday);
  if (!date || !time) {
    problems.push(`${raw.where}: ${raw.code ?? raw.name ?? "exam"} has no ${!date ? "day" : "time"}`);
    return null;
  }
  if (date < window.starts || date > window.ends) problems.push(`${raw.where}: ${raw.code ?? raw.name} on ${date} is outside ${window.starts}–${window.ends}`);
  const minutes = raw.minutes ?? (raw.label.end ? toMin(raw.label.end) - toMin(time) : null);
  return { date, start: time, minutes: minutes && minutes > 0 && minutes <= 600 ? minutes : null };
}

/**
 * Reads exams and seats through a mapping. Seats keep only the ID, never a name.
 * Throws SheetError when a mapped tab is missing or nothing could be read.
 */
export function applyMapping(tabs: Tab[], mapping: Mapping, window: ExamWindowInput): Normalised & { problems: string[] } {
  const year = Number(window.starts.slice(0, 4));
  const problems: string[] = [];
  const raws: Raw[] = [];
  const slotTimes = new Map<string, { time: string; weekday: number | null; date: string | null }>();

  const byName = new Map(tabs.map((t) => [t.name, t]));
  const grids = new Map<string, Grid>();
  for (const m of mapping.tabs) {
    const tab = byName.get(m.tab);
    if (!tab) throw new SheetError(`The sheet has no tab "${m.tab}" any more`);
    grids.set(m.tab, fill(tab.rows));
  }

  // Slot grids first: they say when each slot ("M-2") starts, which student lists may omit.
  for (const m of mapping.tabs) {
    if (m.layout !== "slot_grid") continue;
    const rows = grids.get(m.tab)!;
    const rooms = rows[m.roomRow] ?? [];
    for (let r = m.dataFrom; r < rows.length; r++) {
      const row = rows[r];
      const label = readLabel(m.labelCols.map((c) => row[c]), year);
      if (label.slot && label.time && !slotTimes.has(label.slot)) slotTimes.set(label.slot, { time: label.time, weekday: label.weekday, date: label.date });
      const next = rows[r + 1];
      const nextHasCourses = !!next && m.roomCols.some((c) => parseCourses(next[c]).length);
      for (const c of m.roomCols) {
        const courses = parseCourses(row[c]);
        if (!courses.length) continue;
        const seatCell = !nextHasCourses && next ? next[c] : "";
        const seats = /^\d{1,4}$/.test(seatCell) ? Number(seatCell) : null;
        for (const k of courses) raws.push({ code: k.code, name: k.name, label, minutes: k.minutes, room: normRoom(rooms[c]), seats: courses.length === 1 ? seats : null, studentId: null, where: `${m.tab} row ${r + 1}` });
      }
    }
  }

  for (const m of mapping.tabs) {
    const rows = grids.get(m.tab)!;
    if (m.layout === "student_rows") {
      for (let r = m.dataFrom; r < rows.length; r++) {
        const id = normStudentId(rows[r][m.idCol] ?? "");
        if (!isStudentId(id)) continue;
        for (const p of m.pairs) {
          const courses = parseCourses(rows[r][p.courseCol] ?? "");
          if (!courses.length) continue;
          const room = p.roomCol !== null && isRoom(rows[r][p.roomCol] ?? "") ? normRoom(rows[r][p.roomCol]) : null;
          for (const k of courses) raws.push({ code: k.code, name: k.name, label: p.label, minutes: k.minutes, room, seats: null, studentId: id, where: `${m.tab} row ${r + 1}` });
        }
      }
    }
    if (m.layout === "course_list") {
      const { cols } = m;
      for (let r = m.dataFrom; r < rows.length; r++) {
        const row = rows[r];
        const at = (i?: number) => (i === undefined ? "" : row[i] ?? "");
        const fromCourse = parseCourses(at(cols.course));
        const code = cols.code !== undefined ? parseCourses(`${at(cols.code)} x`)[0]?.code ?? (at(cols.code) ? normCode(at(cols.code)) : null) : null;
        const courses: Array<{ code: string | null; name: string | null; minutes: number | null }> = fromCourse.length
          ? fromCourse
          : code || at(cols.course)
            ? [{ code, name: parseCourseName(at(cols.course))?.name ?? null, minutes: parseCourseName(at(cols.course))?.minutes ?? null }]
            : [];
        if (!courses.length || (!courses[0].code && !courses[0].name)) continue;
        const label = readLabel([at(cols.date), at(cols.day), at(cols.time)], year);
        if (!label.end && cols.end !== undefined) label.end = parseTime(at(cols.end))?.start ?? null;
        const duration = cols.duration !== undefined ? minutesIn(at(cols.duration)) ?? (/^\d{2,3}$/.test(at(cols.duration)) ? Number(at(cols.duration)) : null) : null;
        const seats = cols.seats !== undefined && /^\d{1,4}$/.test(at(cols.seats)) ? Number(at(cols.seats)) : null;
        const studentId = cols.studentId !== undefined && isStudentId(at(cols.studentId)) ? normStudentId(at(cols.studentId)) : null;
        const rooms = cols.room !== undefined ? splitRooms(at(cols.room)) : [];
        for (const k of courses) {
          for (const room of rooms.length ? rooms : [null]) {
            raws.push({ code: k.code, name: k.name, label, minutes: k.minutes ?? duration, room, seats: rooms.length <= 1 ? seats : null, studentId, where: `${m.tab} row ${r + 1}` });
          }
        }
      }
    }
  }

  const exams = new Map<string, NormalExam>();
  const seats: NormalSeat[] = [];
  const minutesOf = new Map<string, number>();
  for (const raw of raws) if (raw.code && raw.minutes) minutesOf.set(raw.code, raw.minutes);
  for (const raw of raws) {
    const at = placed(raw, window, slotTimes, problems);
    if (!at) continue;
    const minutes = at.minutes ?? (raw.code ? minutesOf.get(raw.code) : undefined) ?? DEFAULT_MINUTES;
    const key = `${raw.code ?? raw.name}|${at.date}|${at.start}`;
    const e = exams.get(key) ?? exams.set(key, { code: raw.code, name: raw.name, date: at.date, start: at.start, minutes, rooms: [], seats: null }).get(key)!;
    if (!e.name && raw.name) e.name = raw.name;
    e.minutes = Math.max(e.minutes, minutes);
    if (raw.room && !e.rooms.includes(raw.room)) e.rooms.push(raw.room);
    if (raw.seats !== null && !raw.studentId) e.seats = (e.seats ?? 0) + raw.seats;
    if (raw.studentId) seats.push({ studentId: raw.studentId, code: raw.code, name: raw.name, date: at.date, start: at.start, minutes, room: raw.room });
  }
  if (!exams.size) throw new SheetError("No exams could be read from this sheet");
  return { exams: [...exams.values()].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || String(a.code).localeCompare(String(b.code))), seats, problems: [...new Set(problems)].slice(0, 50) };
}

/** Analyses the tabs and reads them; a cached mapping is tried first and replaced when it no longer reads. */
export function readSchedule(tabs: Tab[], window: ExamWindowInput, cached?: Mapping | null): Normalised & { mapping: Mapping; problems: string[]; skipped: string[]; reused: boolean } {
  if (cached?.tabs?.length) {
    try {
      return { ...applyMapping(tabs, cached, window), mapping: cached, skipped: [], reused: true };
    } catch {
      // The sheet changed shape: analyse it again.
    }
  }
  const { mapping, skipped } = analyse(tabs, window);
  if (!mapping.tabs.length) throw new SheetError("This sheet's layout wasn't recognised. Send the exams as JSON through the import endpoint instead.");
  return { ...applyMapping(tabs, mapping, window), mapping, skipped, reused: false };
}

/* ───────────── windows and changes ───────────── */

export const examKindOf = (name: string): ExamKind => (/final/i.test(name) ? "final" : /mid/i.test(name) ? "midterm" : "exam");

/** "Mon 12:30–14:30 · MATH 106": how an exam is described when it changes. */
export function describeExam(e: { date: string; start: string; minutes: number; room: string | null }) {
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${e.date}T00:00:00Z`));
  const end = toMin(e.start) + e.minutes;
  return [`${day} ${e.start}–${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`, e.room].filter(Boolean).join(" · ");
}

export type PlacedExam = { code: string; date: string; start: string; minutes: number; room: string | null };
export type ExamChange = { code: string; before: PlacedExam; after: PlacedExam; what: "room" | "time" | "both" };

/** What moved between two versions of one student's exams, per course. New and dropped exams are not changes. */
export function examChanges(before: PlacedExam[], after: PlacedExam[]): ExamChange[] {
  const out: ExamChange[] = [];
  const old = new Map<string, PlacedExam[]>();
  for (const e of before) old.set(e.code, [...(old.get(e.code) ?? []), e]);
  const fresh = new Map<string, PlacedExam[]>();
  for (const e of after) fresh.set(e.code, [...(fresh.get(e.code) ?? []), e]);
  for (const [code, list] of fresh) {
    const prev = old.get(code);
    // Several sittings of one course can't be paired reliably; only one-to-one moves are reported.
    if (!prev || prev.length !== 1 || list.length !== 1) continue;
    const [a, b] = [prev[0], list[0]];
    const time = a.date !== b.date || a.start !== b.start;
    const room = (a.room ?? "") !== (b.room ?? "");
    if (time || room) out.push({ code, before: a, after: b, what: time && room ? "both" : time ? "time" : "room" });
  }
  return out;
}
