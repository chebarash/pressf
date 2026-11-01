import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { catalogCache } from "@/lib/db/schema";
import { catalog } from "./catalog";

const TABLES = ["term_courses", "mention_links", "mentions", "ratings", "respects", "users", "materials", "syllabi", "course_overrides", "faces", "catalog_cache", "search_events", "teacher_aliases"];

export const resetDb = () => db().execute(sql.raw(`truncate ${TABLES.join(", ")} cascade`));

export async function seedCatalog(updatedAt = new Date()) {
  const { curricula, ...rest } = catalog;
  const rows = [
    ...Object.entries(rest).map(([key, data]) => ({ key, data, sourceUpdatedAt: updatedAt })),
    ...Object.entries(curricula).map(([slug, data]) => ({ key: `curriculum:${slug}`, data, sourceUpdatedAt: updatedAt })),
  ];
  await db().insert(catalogCache).values(rows);
}
