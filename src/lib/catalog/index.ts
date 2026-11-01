import { cache } from "react";
import { db } from "@/lib/db";
import { catalogCache } from "@/lib/db/schema";
import type { Catalog, Course, Semesters, Teacher } from "./types";

export * from "./types";

const empty = (): Catalog => ({
  teachers: [], courses: [], timetable: [], groups: [], schools: [], curricula: {},
  semesters: { current: null, next: null }, updatedAt: null,
});

export const getCatalog = cache(async (): Promise<Catalog> => {
  const catalog = empty();
  for (const row of await db().select().from(catalogCache)) {
    if (row.key.startsWith("curriculum:")) {
      catalog.curricula[row.key.slice("curriculum:".length)] = row.data as Catalog["curricula"][string];
    } else if (row.key === "semesters") {
      catalog.semesters = row.data as Semesters;
    } else if (row.key in catalog) {
      Object.assign(catalog, { [row.key]: row.data });
    }
    const built = row.sourceUpdatedAt;
    if (built && (!catalog.updatedAt || built < catalog.updatedAt)) catalog.updatedAt = built;
  }
  return catalog;
});

export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const findCourse = (catalog: Catalog, code: string): Course | undefined =>
  catalog.courses.find((course) => course.code === normalizeCode(code));

export const findTeacher = (catalog: Catalog, id: string): Teacher | undefined =>
  catalog.teachers.find((teacher) => teacher.id === id);

const DAY = 24 * 60 * 60 * 1000;

/** The bot builds daily, so two days old means something broke. */
export const isStale = (catalog: Catalog) =>
  !!catalog.updatedAt && Date.now() - catalog.updatedAt.getTime() > 2 * DAY;
