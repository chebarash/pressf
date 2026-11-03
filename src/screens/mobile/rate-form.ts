import { MAX_TAGS, toHours, type CourseTag, type Hours, type RatingInput, type TeacherAnswer, type TeacherTag } from "@/core/ratings";
import type { RateDraft, RateItem } from "./views";

/**
 * The rating sheet's form state. Hours are one of the four core buckets
 * ("< 2", "2–5", "5–10", "10+"), the same options as the desktop D5 dialog.
 */
export type FormState = {
  recommend: RatingInput["recommend"];
  hours: Hours | null;
  difficulty: RatingInput["difficulty"];
  tags: CourseTag[];
  teachers: Record<string, { pressF: boolean | null; tags: TeacherTag[] }>;
};

export const teacherKey = (t: { id: string; role: string }) => `${t.id}|${t.role}`;

export function initialForm(item: RateItem, draft: RateDraft | null): FormState {
  const teachers: FormState["teachers"] = {};
  for (const t of item.teachers) {
    const d = draft?.teachers.find((a) => a.teacherId === t.id && a.role === t.role);
    teachers[teacherKey(t)] = { pressF: d?.pressF ?? null, tags: d?.tags ?? [] };
  }
  return { recommend: draft?.recommend ?? null, hours: toHours(draft?.hours), difficulty: draft?.difficulty ?? null, tags: draft?.tags ?? [], teachers };
}

/** Adds or removes a tag; a fourth tag is ignored (up to 3). */
export function toggle<T>(list: T[], tag: T): T[] {
  if (list.includes(tag)) return list.filter((t) => t !== tag);
  return list.length >= MAX_TAGS ? list : [...list, tag];
}

/** Form → the core RatingInput. Teachers left untouched are not sent. */
export function toInput(item: RateItem, f: FormState): RatingInput {
  const teachers: TeacherAnswer[] = item.teachers.flatMap((t) => {
    const a = f.teachers[teacherKey(t)];
    return a && (a.pressF !== null || a.tags.length) ? [{ teacherId: t.id, role: t.role, pressF: a.pressF, tags: a.tags }] : [];
  });
  return { recommend: f.recommend, hours: f.hours, difficulty: f.difficulty, tags: f.tags, teachers };
}
