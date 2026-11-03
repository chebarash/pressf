import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsCourseTeachers, lmsCourses, lmsTeachers } from "@/lib/db/schema";
import { catalog } from "./catalog";

const TABLES = ["term_courses", "mention_links", "mentions", "ratings", "respects", "lms_accounts", "lms_course_teachers", "lms_courses", "lms_teachers", "lms_departments", "lms_programs", "lms_curricula", "lms_semesters", "lms_files", "lms_cache", "users", "materials", "syllabi", "course_overrides", "faces", "catalog_cache", "search_events", "teacher_aliases", "course_ratings", "teacher_ratings", "rating_asks", "uploads", "reports", "feed_items", "user_state", "link_tokens", "audit_log", "broadcasts", "user_roles", "bot_chats", "telegram_files", "file_overrides", "admin_marks"];

export const resetDb = () => db().execute(sql.raw(`truncate ${TABLES.join(", ")} cascade`));

/** Puts the fixture catalog into the harvested LMS tables that getCatalog reads. */
export async function seedCatalog() {
  await db().insert(lmsTeachers).values(catalog.teachers.map((t) => {
    const [firstName, ...rest] = t.display_name.split(" ");
    return { id: t.id, firstName, surName: rest.join(" ") };
  }));
  await db().insert(lmsCourses).values(catalog.courses.map((c) => ({ id: `fixture-${c.code}`, code: c.code, name: c.subject, raw: {} })));
  const links = catalog.courses.flatMap((c) => c.teachers.map((teacherId) => ({ courseId: `fixture-${c.code}`, teacherId, role: "Lecture" })));
  if (links.length) await db().insert(lmsCourseTeachers).values(links);
}
