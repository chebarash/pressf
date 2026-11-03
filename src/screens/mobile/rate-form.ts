import { MAX_TAGS, type CourseTag, type Hours, type RatingInput, type TeacherAnswer, type TeacherTag } from "@/core/ratings";
import type { RateDraft, RateItem } from "./views";

/**
 * The rating sheet's form state. Hours are picked on 12 one-hour blocks
 * (12+ = the last block) and stored as the core buckets.
 */

export const HOUR_BLOCKS = 12;

export function hoursFromBlocks(n: number): Hours | null {
  if (n <= 0) return null;
  if (n <= 2) return "0-2";
  if (n <= 4) return "2-4";
  if (n <= 6) return "4-6";
  if (n <= 10) return "6-10";
  return "10+";
}

const BLOCKS: Record<Hours, number> = { "0-2": 2, "2-4": 4, "4-6": 6, "6-10": 8, "10+": 12 };
export const blocksFromHours = (h: Hours | null) => (h ? BLOCKS[h] : 0);

export const hoursText = (n: number) => (n >= HOUR_BLOCKS ? "12+ h a week" : `≈ ${n} h a week`);

export type FormState = {
  recommend: RatingInput["recommend"];
  blocks: number;
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
  return { recommend: draft?.recommend ?? null, blocks: blocksFromHours(draft?.hours ?? null), difficulty: draft?.difficulty ?? null, tags: draft?.tags ?? [], teachers };
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
  return { recommend: f.recommend, hours: hoursFromBlocks(f.blocks), difficulty: f.difficulty, tags: f.tags, teachers };
}
