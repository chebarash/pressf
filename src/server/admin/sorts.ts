import { sql, type SQL } from "drizzle-orm";
import type { Sort } from "@/core/sort";

/**
 * Columns the server-sorted admin tables accept in `?sort=`. Anything else is
 * ignored (default order); each key maps to a fixed SQL expression in views.ts,
 * so the URL never reaches the query as text.
 */
export const AUDIT_SORTS = ["when", "who", "action"] as const;
export const PEOPLE_SORTS = ["student", "uploads", "trust"] as const;
export const COURSE_SORTS = ["code", "course", "lms", "students", "shares"] as const;
export const UPLOAD_SORTS = ["title", "course", "type", "age"] as const;

export type AuditSort = (typeof AUDIT_SORTS)[number];
export type PeopleSort = (typeof PEOPLE_SORTS)[number];
export type CourseSort = (typeof COURSE_SORTS)[number];
export type UploadSort = (typeof UPLOAD_SORTS)[number];

/**
 * `ORDER BY` for a whitelisted column: missing values last in both directions.
 * `flip` inverts the direction (an "age" column ascending is the newest first).
 */
export function orderBy<K extends string>(sort: NonNullable<Sort<K>>, columns: Record<K, SQL | { expr: SQL; flip: true }>): SQL {
  const c = columns[sort.key];
  const expr = "expr" in c ? c.expr : c;
  const asc = (sort.dir === "asc") !== ("flip" in c && c.flip);
  return sql`${expr} ${asc ? sql`asc` : sql`desc`} nulls last`;
}
