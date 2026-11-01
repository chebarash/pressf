import { and, eq, ilike, or } from "drizzle-orm";
import { getCatalog } from "@/lib/catalog";
import { db } from "@/lib/db";
import { materials } from "@/lib/db/schema";

const fold = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ'’`]/g, "").replace(/[^a-z0-9а-я ]/g, " ");

export type SearchLimits = { courses: number; teachers: number; files: number };

/** The one search behind the site palette and the bot's inline mode. */
export async function search(query: string, limits: SearchLimits) {
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  const { courses, teachers } = await getCatalog();
  const hits = (value: string) => words.every((word) => fold(value).includes(word));
  const fileMatches = words.map((word) => {
    const pattern = `%${word.replace(/[%_]/g, "")}%`;
    return or(ilike(materials.fileName, pattern), ilike(materials.courseCode, pattern), ilike(materials.courseName, pattern));
  });
  return {
    courses: courses.filter((c) => hits(`${c.code} ${c.subject} ${c.aliases.join(" ")}`)).slice(0, limits.courses),
    teachers: words.length ? teachers.filter((t) => hits(`${t.name} ${t.display_name}`)).slice(0, limits.teachers) : [],
    files: words.length ? await db().select().from(materials).where(and(eq(materials.status, "approved"), ...fileMatches)).limit(limits.files) : [],
  };
}
