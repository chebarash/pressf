/**
 * The university's public faculty kiosk (interactive.newuu.uz/faculty) and how
 * its people meet our LMS teachers. Pure logic: parsing, the school → department
 * structure, name matching and the profile precedence (admin > site > LMS).
 */
import { editDistance, fold, words } from "./search";

/* ───────────── departments ───────────── */

export type SiteDepartment = { id: number; name: string };
export type SiteUnit = SiteDepartment & {
  /** "school": a school listing; "department": a department inside `school`; "other": deans and similar. */
  kind: "school" | "department" | "other";
  /** The school this listing belongs to (a school's own name for a school). */
  school: string | null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const decode = (s: string) => s.replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : m));

/** The `<select id="department">` options of the faculty page, in page order (the "Choose…" placeholder dropped). */
export function parseDepartments(html: string): SiteDepartment[] {
  const select = html.match(/<select[^>]*id=["']department["'][^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  const out: SiteDepartment[] = [];
  for (const m of select.matchAll(/<option[^>]*value=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/option>/gi)) {
    const id = Number(m[1]);
    const name = decode(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (id > 0 && name) out.push({ id, name });
  }
  return out;
}

const isSchool = (name: string) => /^school of\b/i.test(name);
/** Listings that never belong to the school above them in the list. */
const STANDALONE = /^deans?\b|general education/i;

/**
 * The page lists each school followed by its departments ("School of Computing",
 * "Department of Software Engineering", "Department of AI", "School of …"), so a
 * department belongs to the nearest school above it. Deans and General Education
 * stand on their own.
 */
export function groupDepartments(list: SiteDepartment[]): SiteUnit[] {
  let school: string | null = null;
  return list.map((d) => {
    if (isSchool(d.name)) {
      school = d.name;
      return { ...d, kind: "school", school: d.name };
    }
    if (STANDALONE.test(d.name)) return { ...d, kind: "other", school: null };
    return { ...d, kind: "department", school };
  });
}

/* ───────────── people ───────────── */

/** "ARUNAVA ROY " → "Arunava Roy". */
export const tidyName = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** Site values as stored: trimmed, placeholders ("x", "-", "N/A") dropped. */
export function clean(value: unknown, max = 200): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const v = String(value).replace(/\s+/g, " ").trim();
  if (!v || /^(x|-+|—|n\/?a|none|null|0)$/i.test(v)) return null;
  return v.slice(0, max);
}

export const cleanEmail = (value: unknown) => {
  const v = clean(value, 120)?.toLowerCase() ?? null;
  return v && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(v) ? v : null;
};

/* ───────────── matching ───────────── */

export type MatchTeacher = { id: string; firstName?: string | null; lastName?: string | null; surName?: string | null };
export type MatchPerson = { siteId: number; name: string; email?: string | null };
export type MatchResult = {
  siteId: number;
  /** Set only for a unique, confident match. */
  teacherId: string | null;
  status: "matched" | "ambiguous" | "unmatched";
  /** Teachers the person could be, best first (empty when nothing comes close). */
  candidates: string[];
};

type Key = { id: string; given: string[]; family: string[]; givenRaw: string; familyRaw: string };

/** A teacher's name words, phonetic: given name + family name (the LMS patronymic only when there is no family name). */
function keyOf(t: MatchTeacher): Key | null {
  const familyText = t.surName?.trim() ? t.surName : t.lastName;
  const given = words(t.firstName, true);
  const family = words(familyText, true);
  if (!given.length || !family.length) return null;
  return { id: t.id, given, family, givenRaw: fold(t.firstName), familyRaw: fold(familyText).replace(/ /g, "") };
}

/** 2 exact, 1 close (a suffix like Siyavush/Siyavushxon, or one typo in a long word), 0 no. */
function wordScore(a: string, b: string): number {
  if (a === b) return 2;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.startsWith(short)) return 1;
  if (short.length >= 5 && editDistance(a, b, 1) <= 1) return 1;
  return 0;
}

/**
 * Whether every word of the teacher's given and family name meets a different
 * word of the site name, in any order. Extra site words (patronymics like
 * "Farruxovich", a second given name) are ignored. Returns the score, or 0.
 */
export function nameScore(key: Pick<Key, "given" | "family">, siteName: string): { score: number; exact: boolean } {
  const site = words(siteName, true);
  const need = [...key.given, ...key.family];
  if (!need.length || site.length < 2) return { score: 0, exact: false };
  // Small inputs (2–5 words): try every assignment, keep the best.
  let best = 0;
  let bestExact = false;
  const used = new Array(site.length).fill(false);
  const walk = (i: number, sum: number, exact: boolean) => {
    if (i === need.length) {
      if (sum > best || (sum === best && exact && !bestExact)) { best = sum; bestExact = exact; }
      return;
    }
    for (let j = 0; j < site.length; j++) {
      if (used[j]) continue;
      const s = wordScore(need[i], site[j]);
      if (!s) continue;
      used[j] = true;
      walk(i + 1, sum + s, exact && s === 2);
      used[j] = false;
    }
  };
  walk(0, 0, true);
  return { score: best, exact: best > 0 && bestExact };
}

/**
 * Whether a university email names this teacher: "a.roy@" or "aroy@" for
 * Arunava Roy, "s.kholmatov@" for Siyavushxon Xolmatov (the surname compared
 * phonetically, so kh/x and similar spellings meet).
 */
export function emailNames(key: Pick<Key, "givenRaw" | "familyRaw" | "family">, email: string | null | undefined): boolean {
  const local = email?.split("@")[0]?.toLowerCase();
  if (!local || !key.givenRaw || !key.familyRaw) return false;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const initial = key.givenRaw[0];
  const family = key.family.join("");
  const sameFamily = (w: string) => {
    const p = words(w, true).join("");
    return !!p && (p === family || (p.length >= 5 && editDistance(p, family, 1) <= 1));
  };
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    const givenOk = first.length === 1 ? first === initial : key.givenRaw.startsWith(first) || words(first, true)[0] === words(key.givenRaw, true)[0];
    return givenOk && sameFamily(last);
  }
  // "aroy": initial + surname in one word.
  return local[0] === initial && sameFamily(local.slice(1));
}

/**
 * Matches site people to LMS teachers. A person is linked only when exactly one
 * teacher fits: one exact name match, or one name match the email confirms.
 * Several fits, only close spellings, or two people landing on one teacher go
 * to the admin as ambiguous; nobody fitting is unmatched (the email can still
 * suggest a candidate). `taken`: teachers already linked by hand.
 */
export function matchPeople(people: MatchPerson[], teachers: MatchTeacher[], taken: Set<string> = new Set()): MatchResult[] {
  const keys = teachers.map(keyOf).filter((k): k is Key => !!k);
  const results = people.map((p): MatchResult => {
    const hits = keys
      .map((k) => ({ k, ...nameScore(k, p.name), email: emailNames(k, p.email) }))
      .filter((h) => h.score > 0)
      .sort((a, b) => Number(b.email) - Number(a.email) || Number(b.exact) - Number(a.exact) || b.score - a.score);
    const candidates = hits.map((h) => h.k.id);
    if (!hits.length) {
      const byEmail = keys.filter((k) => emailNames(k, p.email)).map((k) => k.id);
      return { siteId: p.siteId, teacherId: null, status: "unmatched", candidates: byEmail.slice(0, 5) };
    }
    const confirmed = hits.filter((h) => h.email);
    const pick = confirmed.length === 1 ? confirmed[0] : hits.length === 1 && hits[0].exact ? hits[0] : null;
    if (pick && !taken.has(pick.k.id)) return { siteId: p.siteId, teacherId: pick.k.id, status: "matched", candidates: candidates.slice(0, 5) };
    return { siteId: p.siteId, teacherId: null, status: "ambiguous", candidates: candidates.slice(0, 5) };
  });
  // Two site people on one teacher: neither is sure.
  const count = new Map<string, number>();
  for (const r of results) if (r.teacherId) count.set(r.teacherId, (count.get(r.teacherId) ?? 0) + 1);
  return results.map((r) => (r.teacherId && count.get(r.teacherId)! > 1 ? { ...r, teacherId: null, status: "ambiguous" } : r));
}

/* ───────────── profile precedence ───────────── */

export type ProfileFields = { name: string | null; position: string | null; department: string | null; school: string | null; office: string | null; email: string | null; hours: string | null; note: string | null };
export const PROFILE_FIELDS = ["name", "position", "department", "school", "office", "email", "hours", "note"] as const satisfies ReadonlyArray<keyof ProfileFields>;

type Loose<T> = { [K in keyof T]?: T[K] | null | undefined };

/** One field: the admin's override, else the faculty site, else the LMS. Empty strings count as unset. */
export function mergeProfile(lms: Loose<ProfileFields>, imported: Loose<ProfileFields> | null | undefined, override: Loose<ProfileFields> | null | undefined): ProfileFields {
  const pick = (k: keyof ProfileFields) => {
    for (const src of [override, imported, lms]) {
      const v = src?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  return Object.fromEntries(PROFILE_FIELDS.map((k) => [k, pick(k)])) as ProfileFields;
}

/** Admin edits as stored: trimmed, empty → null (use the imported value). Throws with a message the editor shows. */
export const LIMITS: Record<keyof ProfileFields, number> = { name: 80, position: 80, department: 120, school: 120, office: 40, email: 80, hours: 200, note: 280 };

export function validateOverride(input: Loose<ProfileFields>): ProfileFields {
  const out = {} as ProfileFields;
  for (const k of PROFILE_FIELDS) {
    const raw = input[k];
    const v = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
    if (v.length > LIMITS[k]) throw new RangeError(`${k[0].toUpperCase()}${k.slice(1)} is too long (max ${LIMITS[k]} characters)`);
    out[k] = v || null;
  }
  if (out.email) {
    out.email = out.email.toLowerCase();
    if (!/^[a-z0-9._%+-]+@newuu\.uz$/.test(out.email)) throw new RangeError("Email must be a @newuu.uz address");
  }
  return out;
}

/** "Department of Software Engineering" → "Software Engineering" for compact places. */
export const shortUnit = (name: string | null | undefined) => (name ?? "").replace(/^(department|school) of /i, "").trim();
