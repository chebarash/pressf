import { distance } from "@/lib/catalog/names";
import type { Course, Teacher } from "@/lib/catalog";

/** How sure we are that a post is about the thing it is linked to. Says nothing about whether it is true. */
export type Certainty = "exact" | "possible";

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

const fold = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[а-яёўқғҳ]/g, (letter) => CYRILLIC[letter] ?? letter).replace(/[^a-z0-9]+/g, " ").trim();

const nearly = (word: string, name: string) => {
  if (name.length < 4) return word === name;
  return distance(word, name) <= (name.length < 6 ? 1 : 2);
};

export function courseCertainty(text: string, course: Pick<Course, "code" | "subject" | "aliases">): Certainty {
  const post = ` ${fold(text)} `;
  const [, letters, digits] = course.code.toLowerCase().match(/^([a-z]+)(\d+)$/) ?? [];
  if (letters && new RegExp(`\\b${letters} ?${digits}\\b`).test(post)) return "exact";
  const named = [course.subject, ...course.aliases].some((name) => post.includes(` ${fold(name)} `));
  return named ? "exact" : "possible";
}

/**
 * A linked post that only shares a given name is often about someone else, so the
 * surname has to be there. Sources give names in any order, and the email id is
 * the only place that says which word is the surname.
 */
export function teacherCertainty(text: string, teacher: Pick<Teacher, "id" | "display_name">): Certainty {
  const words = fold(text).split(" ");
  const fromId = teacher.id.match(/^[a-z]+-([a-z]+)$/)?.[1];
  if (fromId) return words.some((word) => nearly(word, fromId)) ? "exact" : "possible";
  const parts = fold(teacher.display_name).split(" ");
  return parts.every((part) => words.some((word) => nearly(word, part))) ? "exact" : "possible";
}
