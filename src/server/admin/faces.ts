/**
 * A6 Professors · Faces: admins draw, upload and assign professor faces.
 * Faces are drawings, never photos. Every change is audited and expires the
 * cached professor, course and search data that shows the face.
 */
import { eq, notInArray, sql } from "drizzle-orm";
import { checkFace } from "@/core/faces";
import { displayName } from "@/core/people";
import { createIndex } from "@/core/search";
import { db } from "@/lib/db";
import { faces, lmsCourseTeachers, lmsTeachers, teacherAliases } from "@/lib/db/schema";
import { putObject } from "@/lib/storage";
import { audit } from "@/server/audit";
import { invalidate, TAGS } from "@/server/views/cache";
import { faceUrl } from "@/server/views/shared";
import { authorize } from "./access";
import { AdminError } from "./ops";

const changed = (...teacherIds: string[]) => invalidate(TAGS.catalog, ...teacherIds.map(TAGS.teacher));

async function teacher(id: string) {
  const [t] = await db().select({ id: lmsTeachers.id }).from(lmsTeachers).where(eq(lmsTeachers.id, id));
  if (!t) throw new AdminError("No such professor");
  return t;
}

/** Uploads a drawn face (PNG with transparency, or SVG) and assigns it, replacing any earlier one. */
export async function setFace(actorId: string, teacherId: string, bytes: Uint8Array) {
  await authorize(actorId, "admin:catalog");
  await teacher(teacherId);
  const check = checkFace(bytes);
  if (!check.ok) throw new AdminError(check.error);
  const now = new Date();
  // A new key per version: the bucket object never changes under a cached URL.
  const key = await putObject(`faces/${teacherId}/${now.getTime().toString(36)}.${check.format.ext}`, Buffer.from(bytes), check.format.contentType);
  const [before] = await db().select().from(faces).where(eq(faces.teacherId, teacherId));
  await db().insert(faces).values({ teacherId, storageKey: key, updatedAt: now }).onConflictDoUpdate({ target: faces.teacherId, set: { storageKey: key, updatedAt: now } });
  await audit(actorId, before ? "face.replace" : "face.set", `teacher:${teacherId}`, { key, previous: before?.storageKey ?? null, format: check.format.type, bytes: bytes.length });
  changed(teacherId);
  return { message: before ? "Face replaced" : "Face added" };
}

export async function removeFace(actorId: string, teacherId: string) {
  await authorize(actorId, "admin:catalog");
  const [before] = await db().delete(faces).where(eq(faces.teacherId, teacherId)).returning();
  if (!before) throw new AdminError("No face to remove");
  // The bucket object stays: the audit entry points at it.
  await audit(actorId, "face.remove", `teacher:${teacherId}`, { key: before.storageKey });
  changed(teacherId);
  return { message: "Face removed" };
}

/* ───────── view ───────── */

export type FacesShow = "missing" | "with";

export async function facesPage(show: FacesShow, q: string, selectedId: string | undefined) {
  const [teachers, courseCounts] = await Promise.all([
    db()
      .select({ id: lmsTeachers.id, firstName: lmsTeachers.firstName, lastName: lmsTeachers.lastName, surName: lmsTeachers.surName, position: lmsTeachers.position, faceAt: faces.updatedAt, key: faces.storageKey })
      .from(lmsTeachers)
      .leftJoin(faces, eq(faces.teacherId, lmsTeachers.id))
      .where(notInArray(lmsTeachers.id, db().select({ id: teacherAliases.oldId }).from(teacherAliases))),
    db().select({ id: lmsCourseTeachers.teacherId, n: sql<number>`count(distinct ${lmsCourseTeachers.courseId})` }).from(lmsCourseTeachers).groupBy(lmsCourseTeachers.teacherId),
  ]);
  const courses = new Map(courseCounts.map((c) => [c.id, Number(c.n)]));
  const all = teachers
    .map((t) => ({
      id: t.id,
      name: displayName({ first_name_en: t.firstName, last_name_en: t.lastName, sur_name_en: t.surName }),
      position: t.position,
      courses: courses.get(t.id) ?? 0,
      face: t.faceAt ? faceUrl(t.id, t.faceAt) : null,
      key: t.key,
      updatedAt: t.faceAt?.toISOString() ?? null,
    }))
    // Busiest professors first: their faces show up most.
    .sort((a, b) => b.courses - a.courses || a.name.localeCompare(b.name));
  const withFace = all.filter((t) => t.face);
  const missing = all.filter((t) => !t.face);
  const term = q.trim();
  const pool = show === "with" ? withFace : missing;
  // Same ranking as the site search (both name orders, accents, Cyrillic, typos).
  const list = term ? createIndex(pool.map((t) => ({ item: t, text: t.name })), { names: true }).search(term, 300).map((h) => h.item) : pool.slice(0, 300);
  const selected = all.find((t) => t.id === selectedId) ?? list[0] ?? null;


  return {
    show,
    q: term,
    total: all.length,
    counts: { with: withFace.length, missing: missing.length },
    list: list.map(({ key: _key, ...t }) => t),
    selected: selected ? { id: selected.id, name: selected.name, position: selected.position, courses: selected.courses, face: selected.face, updatedAt: selected.updatedAt, format: selected.key?.toLowerCase().endsWith(".svg") ? "SVG" : selected.key ? "PNG" : null } : null,
  };
}

