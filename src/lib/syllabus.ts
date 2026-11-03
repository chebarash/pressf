import { z } from "zod";
import type { Course } from "@/lib/catalog";
import { normalizeCode } from "@/lib/catalog";
import type { SyllabusData } from "@/lib/db/schema";

/**
 * A parsed syllabus, as the operator submits it (POST /api/admin/syllabus).
 * Rules for filling it in: only what the document states, in English, names and
 * codes as written; "" / null / [] when absent; weights and hours as printed.
 * prerequisites.status: "listed", "none" (the document says None) or
 * "not_stated"; each group is one requirement, alternatives go in its any_of,
 * and code is set only when the document prints one.
 */
export const SyllabusSchema = z.object({
  is_syllabus: z.boolean(),
  course_code: z.string(),
  course_title: z.string(),
  term: z.string(),
  academic_year: z.string(),
  credits: z.number().nullable(),
  ects: z.number().nullable(),
  total_hours: z.number().nullable(),
  contact_hours_per_week: z.object({ lectures: z.number().nullable(), tutorials: z.number().nullable(), labs: z.number().nullable(), raw: z.string() }),
  prerequisites: z.object({
    status: z.enum(["listed", "none", "not_stated"]),
    groups: z.array(z.object({ any_of: z.array(z.object({ text: z.string(), code: z.string() })) })),
  }),
  description: z.string(),
  learning_outcomes: z.array(z.string()),
  assessment: z.array(z.object({ name: z.string(), weight_percent: z.number().nullable(), timing: z.string() })),
  workload: z.array(z.object({ activity: z.string(), hours: z.number() })),
  instructors: z.array(z.object({ name: z.string(), position: z.string(), email: z.string(), office: z.string(), office_hours: z.string() })),
  books: z.array(z.object({ title: z.string(), authors: z.string(), edition: z.string(), kind: z.enum(["required", "recommended"]) })),
  topics_by_week: z.array(z.object({ week: z.string(), topic: z.string() })),
  tools: z.array(z.string()),
  attendance_policy: z.string(),
  late_work_policy: z.string(),
});

/**
 * One submission to POST /api/admin/syllabus. `sourceKey` or `fileId` name the
 * queued file it answers. `is_syllabus` may be left out; false clears the
 * queued file without storing anything.
 */
export const SyllabusSubmitSchema = z.object({
  courseCode: z.string().trim().min(1).max(20),
  sourceKey: z.string().trim().min(1).max(200).optional(),
  fileId: z.string().trim().min(1).max(200).optional(),
  data: SyllabusSchema.extend({ is_syllabus: z.boolean().default(true) }),
});

const ROMAN: Record<string, string> ={ i: "1", ii: "2", iii: "3", iv: "4" };

/** Compares course titles across spellings: "Skills II", "Skills 2", Cyrillic lookalikes. */
export function titleKey(title: string) {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[с]/g, "c").replace(/[а]/g, "a").replace(/[е]/g, "e").replace(/[о]/g, "o")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ROMAN[word] ?? word)
    .join(" ");
}

/** A code alone is not proof: numbering moved between years, so the title must agree too. */
/**
 * The university renumbered courses, so a syllabus may carry an old code. The
 * title decides then, unless two courses share it: those are told apart by hand.
 */
export function findSyllabusCourse(data: Pick<SyllabusData, "course_code" | "course_title">, courses: Course[]) {
  if (matchesCourse(data, courses)) return normalizeCode(data.course_code);
  const title = titleKey(data.course_title);
  const same = courses.filter((course) => [course.subject, ...course.aliases].some((name) => titleKey(name) === title));
  return same.length === 1 && !same[0].same_name_codes.length ? same[0].code : null;
}

export function matchesCourse(data: Pick<SyllabusData, "course_code" | "course_title">, courses: Course[]) {
  const course = courses.find((item) => item.code === normalizeCode(data.course_code));
  if (!course) return false;
  const a = titleKey(data.course_title);
  return [course.subject, ...course.aliases].some((name) => {
    const b = titleKey(name);
    return a === b || a.includes(b) || b.includes(a);
  });
}

export function syllabusFlags(data: SyllabusData, courses: Course[]) {
  const flags: string[] = [];
  const code = normalizeCode(data.course_code);
  const course = courses.find((item) => item.code === code);
  if (!course) flags.push(`${data.course_code} is not in the course catalog.`);
  else if (!matchesCourse(data, courses)) flags.push(`The catalog calls ${code} "${course.subject}", the syllabus says "${data.course_title}".`);
  const weights = data.assessment.map((item) => item.weight_percent ?? 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length && Math.abs(sum - 100) > 0.5) flags.push(`Assessment weights add up to ${sum}%.`);
  const hours = data.workload.reduce((a, b) => a + b.hours, 0);
  if (hours && data.total_hours && Math.abs(hours - data.total_hours) > 1) flags.push(`The workload adds up to ${hours}, the syllabus says ${data.total_hours}.`);
  if (data.ects && data.total_hours && data.total_hours !== data.ects * 30) flags.push(`${data.ects} ECTS should mean ${data.ects * 30} hours, the syllabus says ${data.total_hours}.`);
  const self = data.prerequisites.groups.flatMap((group) => group.any_of).some((item) => normalizeCode(item.code) === code);
  if (self) flags.push("The course lists itself as a prerequisite.");
  return flags;
}

const hidden = /^(tba|tbd|n\/?a|-|—)?\.?$/i;
export const isStated = (value: string | null | undefined) => !!value && !hidden.test(value.trim());

/** Newest first. Terms look like "Fall 2024" or plain "Fall" with a separate year. */
export function termRank(data: SyllabusData) {
  const inTerm = data.term.match(/20\d{2}/)?.[0];
  const span = [...data.academic_year.matchAll(/20\d{2}/g)].map((m) => Number(m[0]));
  const season = `${data.term} ${data.academic_year}`;
  const spring = /spring/i.test(season);
  // In 2024/2025 the fall is 2024 and the spring is 2025.
  const year = inTerm ? Number(inTerm) : (spring ? span.at(-1) : span[0]) ?? 0;
  return year * 10 + (spring ? 1 : /fall/i.test(season) ? 2 : 0);
}
