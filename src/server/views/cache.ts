import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Shared cache for public data (course and professor pages, catalog,
 * curriculum, rating summaries). Per-user data never goes through here.
 *
 * The app does not run with `cacheComponents` yet, so this wraps
 * `unstable_cache` (JSON: return plain objects and ISO date strings only).
 * When Cache Components is switched on, only this file changes to
 * `'use cache'` + `cacheTag` + `cacheLife`; the tags stay the same.
 */

export const TAGS = {
  catalog: "catalog",
  ratings: "ratings",
  course: (code: string) => `course:${code}`,
  teacher: (id: string) => `teacher:${id}`,
  files: (code: string) => `files:${code}`,
} as const;

/** One hour by default; tags make writes visible right away. */
const DEFAULT_REVALIDATE_S = 3600;

const outsideNext = (error: unknown) =>
  error instanceof Error && /incrementalCache|Invariant|static generation store|workStore/i.test(error.message);

export function publicCache<A extends unknown[], R>(
  key: string,
  fn: (...args: A) => Promise<R>,
  tags: (...args: A) => string[],
  revalidate = DEFAULT_REVALIDATE_S,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    if (process.env.VITEST || process.env.NODE_ENV === "test") return fn(...args);
    try {
      return await unstable_cache(() => fn(...args), [key, JSON.stringify(args)], { tags: [...new Set(tags(...args))], revalidate })();
    } catch (error) {
      // Cron routes and scripts run outside a Next request: read straight through.
      if (outsideNext(error)) return fn(...args);
      throw error;
    }
  };
}

/** Marks tagged data stale; the next visit serves stale and refreshes in the background. */
export function invalidate(...tags: string[]) {
  for (const tag of new Set(tags)) {
    try {
      revalidateTag(tag, "max");
    } catch {
      // Outside a Next request (tests, scripts) there is nothing to invalidate.
    }
  }
}

/** Call after a rating is saved or changed. */
export const invalidateRating = (courseCode: string | null | undefined, teacherIds: string[] = []) =>
  invalidate(TAGS.ratings, ...(courseCode ? [TAGS.course(courseCode)] : []), ...teacherIds.map(TAGS.teacher));

/** Call after a student upload goes live, is hidden or edited. */
export const invalidateUpload = (courseCode: string | null | undefined) =>
  invalidate(...(courseCode ? [TAGS.files(courseCode), TAGS.course(courseCode)] : [TAGS.catalog]));

/** Call after an LMS harvest (catalog, teachers, curricula) or a course files pull. */
export const invalidateHarvest = (courseCodes: string[] = []) =>
  invalidate(TAGS.catalog, ...courseCodes.flatMap((code) => [TAGS.course(code), TAGS.files(code)]));
