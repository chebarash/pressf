/**
 * A6 Professors · Faces: admins draw, upload and assign professor faces.
 * Faces are drawings, never photos. Every change is audited and expires the
 * cached professor, course and search data that shows the face.
 */
import { eq, notInArray, sql } from "drizzle-orm";
import { checkFace } from "@/core/faces";
import { displayName } from "@/core/people";
import { createIndex } from "@/core/search";
import { oldTeacherNames, rankCandidates, transferOldFaces } from "@/server/faces-transfer";
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

/** A face row whose id is no current professor: kept from the old catalog, waiting to be matched. */
async function oldFace(oldId: string) {
  const [row] = await db().select().from(faces).where(eq(faces.teacherId, oldId));
  if (!row) throw new AdminError("That old face is gone — reload");
  const [current] = await db().select({ id: lmsTeachers.id }).from(lmsTeachers).where(eq(lmsTeachers.id, oldId));
  if (current) throw new AdminError("That face already belongs to a professor");
  return row;
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

/** Moves a face kept under an old catalog id to a current professor. */
export async function assignOldFace(actorId: string, oldId: string, teacherId: string) {
  await authorize(actorId, "admin:catalog");
  await teacher(teacherId);
  const row = await oldFace(oldId);
  const now = new Date();
  const replaced = await db().transaction(async (tx) => {
    const [before] = await tx.select().from(faces).where(eq(faces.teacherId, teacherId));
    await tx.delete(faces).where(eq(faces.teacherId, oldId));
    await tx.insert(faces).values({ teacherId, storageKey: row.storageKey, updatedAt: now }).onConflictDoUpdate({ target: faces.teacherId, set: { storageKey: row.storageKey, updatedAt: now } });
    return before?.storageKey ?? null;
  });
  await audit(actorId, "face.assign-old", `teacher:${teacherId}`, { from: oldId, key: row.storageKey, previous: replaced });
  changed(teacherId, oldId);
  return { message: "Old face assigned" };
}

/** Drops an old face nobody matches (the bucket object stays). */
export async function discardOldFace(actorId: string, oldId: string) {
  await authorize(actorId, "admin:catalog");
  const row = await oldFace(oldId);
  await db().delete(faces).where(eq(faces.teacherId, oldId));
  await audit(actorId, "face.discard-old", `face:${oldId}`, { key: row.storageKey });
  changed(oldId);
  return { message: "Old face discarded" };
}

/** The deploy-time transfer, run again by hand (same rules: only unique, confident matches move). */
export async function runFaceTransfer(actorId: string) {
  await authorize(actorId, "admin:catalog");
  const r = await transferOldFaces();
  await audit(actorId, "face.transfer-run", "faces", r);
  if (r.moved) changed();
  return { message: `${r.moved} moved · ${r.waiting} left to match` };
}

/* ───────── view ───────── */

export type FacesShow = "missing" | "with" | "old";

export async function facesPage(show: FacesShow, q: string, selectedId: string | undefined) {
  const [teachers, courseCounts, orphans, names] = await Promise.all([
    db()
      .select({ id: lmsTeachers.id, firstName: lmsTeachers.firstName, lastName: lmsTeachers.lastName, surName: lmsTeachers.surName, position: lmsTeachers.position, faceAt: faces.updatedAt, key: faces.storageKey })
      .from(lmsTeachers)
      .leftJoin(faces, eq(faces.teacherId, lmsTeachers.id))
      .where(notInArray(lmsTeachers.id, db().select({ id: teacherAliases.oldId }).from(teacherAliases))),
    db().select({ id: lmsCourseTeachers.teacherId, n: sql<number>`count(distinct ${lmsCourseTeachers.courseId})` }).from(lmsCourseTeachers).groupBy(lmsCourseTeachers.teacherId),
    db()
      .select({ id: faces.teacherId, key: faces.storageKey, at: faces.updatedAt, aliasOf: teacherAliases.teacherId })
      .from(faces)
      .leftJoin(teacherAliases, eq(teacherAliases.oldId, faces.teacherId))
      .where(notInArray(faces.teacherId, db().select({ id: lmsTeachers.id }).from(lmsTeachers))),
    oldTeacherNames(),
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
  const selected = show === "old" ? null : (all.find((t) => t.id === selectedId) ?? list[0] ?? null);

  const byId = new Map(all.map((t) => [t.id, t]));
  const old = orphans
    .map((o) => {
      const known = names.get(o.id) ?? [];
      const oldName = known[0] ?? null;
      const alias = o.aliasOf ? byId.get(o.aliasOf) : undefined;
      // The merged professor first, then name look-alikes without a face of their own.
      const scored = rankCandidates(known, missing);
      const matches = alias ? [{ id: alias.id, name: alias.name, score: 1 }, ...scored.filter((m) => m.id !== alias.id)].slice(0, 3) : scored;
      return { oldId: o.id, oldName, image: faceUrl(o.id, o.at), matches: matches.map((m) => ({ ...m, pct: Math.round(m.score * 100) })) };
    })
    .sort((a, b) => (b.matches[0]?.score ?? 0) - (a.matches[0]?.score ?? 0) || (a.oldName ?? "").localeCompare(b.oldName ?? ""));

  return {
    show,
    q: term,
    total: all.length,
    counts: { with: withFace.length, missing: missing.length, old: old.length },
    list: show === "old" ? [] : list.map(({ key: _key, ...t }) => t),
    selected: selected ? { id: selected.id, name: selected.name, position: selected.position, courses: selected.courses, face: selected.face, updatedAt: selected.updatedAt, format: selected.key?.toLowerCase().endsWith(".svg") ? "SVG" : selected.key ? "PNG" : null } : null,
    old,
    /** Everyone without a face, for assigning an old face by hand. */
    choices: show === "old" ? missing.map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name)) : [],
  };
}

