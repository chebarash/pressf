/** Names as shown: given name + surname only, from the LMS English fields. */

export type LmsName = { first_name_en?: string | null; last_name_en?: string | null; sur_name_en?: string | null };

const tidy = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** NewUU puts the given name in first_name_en and the family name in last_name_en (sur_name_en is the patronymic). */
export const displayName = (n: LmsName) => [tidy(n.first_name_en), tidy(n.last_name_en)].filter(Boolean).join(" ") || "Teacher";

/** "Gonçalo P." for compact places. */
export const shortName = (full: string) => {
  const [given, ...rest] = full.split(/\s+/);
  return rest.length ? `${given} ${rest[rest.length - 1][0]}.` : given;
};

export const initials = (full: string) =>
  full.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

/** LMS employee_type → our teaching role. */
export function roleOf(type: string | null | undefined): "lecture" | "tutorial" | "lab" | "practice" | "other" {
  const t = (type ?? "").toLowerCase();
  if (t.startsWith("lect")) return "lecture";
  if (t.startsWith("lab")) return "lab";
  if (t.startsWith("tut") || t.startsWith("sem")) return "tutorial";
  if (t.startsWith("prac")) return "practice";
  return "other";
}
