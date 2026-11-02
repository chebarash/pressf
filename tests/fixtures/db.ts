import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { catalogCache } from "@/lib/db/schema";
import { catalog } from "./catalog";

const TABLES = ["term_courses", "mention_links", "mentions", "ratings", "respects", "lms_accounts", "lms_course_teachers", "lms_courses", "lms_teachers", "lms_departments", "lms_programs", "lms_curricula", "lms_files", "lms_cache", "users", "materials", "syllabi", "course_overrides", "faces", "catalog_cache", "search_events", "teacher_aliases", "course_ratings", "teacher_ratings", "rating_asks", "uploads", "reports", "feed_items", "user_state", "link_tokens", "audit_log", "broadcasts", "user_roles", "bot_chats", "telegram_files", "file_overrides", "admin_marks"];

export const resetDb = () => db().execute(sql.raw(`truncate ${TABLES.join(", ")} cascade`));

export async function seedCatalog(updatedAt = new Date()) {
  const { curricula, ...rest } = catalog;
  const rows = [
    ...Object.entries(rest).map(([key, data]) => ({ key, data, sourceUpdatedAt: updatedAt })),
    ...Object.entries(curricula).map(([slug, data]) => ({ key: `curriculum:${slug}`, data, sourceUpdatedAt: updatedAt })),
  ];
  await db().insert(catalogCache).values(rows);
}
