/** Names as shown: given name + surname only, from the LMS English fields. */

export type LmsName = { first_name_en?: string | null; last_name_en?: string | null; sur_name_en?: string | null };

const tidy = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** Titles and placeholder numbers some LMS records carry in a name field ("Prof. 2 Selim"): a name is only the name. */
const NOISE = /^(?:prof|professor|dr|mr|mrs|ms|assoc|asst)\.?$|^\d+\.?$/i;
const bare = (s: string | null | undefined) => tidy((s ?? "").split(/\s+/).filter((w) => w && !NOISE.test(w)).join(" "));

/**
 * hero.study names: `first_name_*` is the given name, `sur_name_*` the family
 * name and `last_name_*` the patronymic (empty for most teachers). Checked on
 * real `/employee/get-by-id`, `/subject/my-list` and `/schedule/list` rows:
 * { first_name_en: "Sejuti", sur_name_en: "Rahman", last_name_en: "" }.
 * The patronymic only stands in when a record has no family name at all.
 */
export const displayName = (n: LmsName) => [bare(n.first_name_en), bare(n.sur_name_en) || bare(n.last_name_en)].filter(Boolean).join(" ") || "Teacher";

/** A stored teacher row (`lms_teachers`) as shown: given name + family name. */
export const teacherName = (t: { firstName?: string | null; lastName?: string | null; surName?: string | null }) =>
  displayName({ first_name_en: t.firstName, last_name_en: t.lastName, sur_name_en: t.surName });

/** One language of an LMS record: English first, then the others, never an empty string. */
export function localized(row: Record<string, unknown> | null | undefined, field: string): string | null {
  if (!row) return null;
  for (const lang of ["en", "uz", "ru", "card", "kz"]) {
    const v = row[`${field}_${lang}`];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const plain = row[field];
  return typeof plain === "string" && plain.trim() ? plain.trim() : null;
}

/** A person from any LMS record carrying `first_name_*` / `sur_name_*` / `last_name_*` in several languages. */
export const personOf = (row: Record<string, unknown> | null | undefined) =>
  displayName({ first_name_en: localized(row, "first_name"), last_name_en: localized(row, "last_name"), sur_name_en: localized(row, "sur_name") });

const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with"]);

/** A course name as shown: trimmed, single spaces, small connecting words in lower case ("Theory Of Computation" → "Theory of Computation"). */
export function courseTitle(name: string | null | undefined): string {
  const words = (name ?? "").trim().replace(/\s+/g, " ").split(" ");
  return words.map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) && /^[A-Z][a-z]*$/.test(w) ? w.toLowerCase() : w)).join(" ");
}

/** "Gonçalo P." for compact places. */
export const shortName = (full: string) => {
  const [given, ...rest] = full.split(/\s+/);
  return rest.length ? `${given} ${rest[rest.length - 1][0]}.` : given;
};

export const initials = (full: string) =>
  full.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

/** LMS employee_type → our teaching role. */
export function roleOf(type: string | number | null | undefined): "lecture" | "tutorial" | "lab" | "practice" | "other" {
  // The LMS lesson-type ids (`/schedule/lesson-types`): 0 Lecture, 1 Tutorial, 2 Laboratory, 3 Practice.
  const byId: Record<string, "lecture" | "tutorial" | "lab" | "practice"> = { "0": "lecture", "1": "tutorial", "2": "lab", "3": "practice" };
  if (type !== null && type !== undefined && byId[String(type).trim()]) return byId[String(type).trim()];
  const t = String(type ?? "").toLowerCase();
  if (t.startsWith("lect")) return "lecture";
  if (t.startsWith("lab")) return "lab";
  if (t.startsWith("tut") || t.startsWith("sem")) return "tutorial";
  if (t.startsWith("prac")) return "practice";
  return "other";
}
