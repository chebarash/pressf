/**
 * Moves professor faces drawn for the old catalog (keyed by the bot's teacher
 * ids) to the LMS professors. Runs on every deploy (scripts/migrate.ts) and is
 * idempotent: only faces whose id is no current professor are looked at, and a
 * moved face is keyed by the new id. Bucket objects are never copied or deleted;
 * the row keeps pointing at the same drawing.
 *
 * A face moves on its own only when the match is unique and confident; the rest
 * wait in Admin → Professors → Faces → Old faces for a one-click match.
 */
import { eq, notInArray } from "drizzle-orm";
import { displayName } from "@/core/people";
import { nameSimilarity, words } from "@/core/search";
import { db } from "@/lib/db";
import { auditLog, catalogCache, faces, lmsTeachers, teacherAliases } from "@/lib/db/schema";

/** Both the old name and the professor's name must cover each other this well… */
export const SURE = 0.9;
/** …and the runner-up must trail by this much. */
export const MARGIN = 0.15;

type OldTeacher = { id?: unknown; name?: unknown; display_name?: unknown; previous_ids?: unknown };

/** Old catalog id (and its previous ids) → every name the old catalog gave that teacher. */
export async function oldTeacherNames(): Promise<Map<string, string[]>> {
  const rows = await db().select({ key: catalogCache.key, data: catalogCache.data }).from(catalogCache).where(eq(catalogCache.key, "teachers"));
  const out = new Map<string, string[]>();
  for (const t of (Array.isArray(rows[0]?.data) ? rows[0].data : []) as OldTeacher[]) {
    if (!t || typeof t !== "object") continue;
    const names = [t.display_name, t.name].filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim());
    const ids = [t.id, ...(Array.isArray(t.previous_ids) ? t.previous_ids : [])].filter((v) => v != null).map(String);
    for (const id of ids) out.set(id, [...new Set([...(out.get(id) ?? []), ...names])]);
  }
  return out;
}

/** How well one current professor matches an old teacher's names (0–1, best spelling). */
export function matchScore(current: string, oldNames: string[]): number {
  const size = words(current, true).length;
  if (size < 2) return 0;
  // Every word of the given name + surname must be in the old name; one extra old word (a patronymic) is fine.
  return Math.max(0, ...oldNames.map((n) => nameSimilarity(current, n, "a") * (words(n, true).length > size + 1 ? 0.9 : 1)));
}

export type Candidate = { id: string; name: string; score: number };

/** Ranked current professors for one old face. */
export function rankCandidates(oldNames: string[], people: Array<{ id: string; name: string }>, limit = 3): Candidate[] {
  if (!oldNames.length) return [];
  return people
    .map((p) => ({ id: p.id, name: p.name, score: matchScore(p.name, oldNames) }))
    .filter((c) => c.score >= 0.55)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** The one professor a face can move to on its own, or null. */
export function sureMatch(ranked: Candidate[]): Candidate | null {
  const [best, next] = ranked;
  if (!best || best.score < SURE) return null;
  if (next && best.score - next.score < MARGIN) return null;
  return best;
}

export type TransferReport = { old: number; moved: number; viaMerge: number; waiting: number; conflicts: number };

export async function transferOldFaces(log: (line: string) => void = () => {}): Promise<TransferReport> {
  const [teachers, orphans, aliases, names] = await Promise.all([
    db().select({ id: lmsTeachers.id, firstName: lmsTeachers.firstName, lastName: lmsTeachers.lastName }).from(lmsTeachers),
    db().select().from(faces).where(notInArray(faces.teacherId, db().select({ id: lmsTeachers.id }).from(lmsTeachers))),
    db().select().from(teacherAliases),
    oldTeacherNames(),
  ]);
  const report: TransferReport = { old: orphans.length, moved: 0, viaMerge: 0, waiting: 0, conflicts: 0 };
  if (!orphans.length || !teachers.length) {
    report.waiting = orphans.length;
    log(`faces: ${report.old} old faces, ${teachers.length} professors; nothing to move`);
    return report;
  }
  const merged = new Set(aliases.map((a) => a.oldId));
  const aliasOf = new Map(aliases.map((a) => [a.oldId, a.teacherId]));
  const withFace = new Set((await db().select({ id: faces.teacherId }).from(faces)).map((f) => f.id));
  const people = teachers.filter((t) => !merged.has(t.id)).map((t) => ({ id: t.id, name: displayName({ first_name_en: t.firstName, last_name_en: t.lastName }) }));

  // Plan first, so two old faces wanting the same professor both wait for a person to decide.
  const plan = new Map<string, { oldId: string; key: string; how: "merge" | "name"; score: number }[]>();
  for (const o of orphans) {
    const merge = aliasOf.get(o.teacherId);
    const target = merge && !withFace.has(merge) ? { id: merge, score: 1, how: "merge" as const } : null;
    const sure = target ?? (() => {
      const m = sureMatch(rankCandidates(names.get(o.teacherId) ?? [], people.filter((p) => !withFace.has(p.id))));
      return m ? { id: m.id, score: m.score, how: "name" as const } : null;
    })();
    if (!sure) continue;
    plan.set(sure.id, [...(plan.get(sure.id) ?? []), { oldId: o.teacherId, key: o.storageKey, how: sure.how, score: sure.score }]);
  }

  for (const [teacherId, wants] of plan) {
    if (wants.length > 1) {
      report.conflicts += wants.length;
      log(`faces: ${wants.length} old faces match ${teacherId}; left for the admin`);
      continue;
    }
    const [w] = wants;
    const now = new Date();
    const moved = await db().transaction(async (tx) => {
      const [taken] = await tx.select({ id: faces.teacherId }).from(faces).where(eq(faces.teacherId, teacherId));
      if (taken) return false;
      const gone = await tx.delete(faces).where(eq(faces.teacherId, w.oldId)).returning();
      if (!gone.length) return false;
      await tx.insert(faces).values({ teacherId, storageKey: w.key, updatedAt: now });
      await tx.insert(auditLog).values({ actorId: null, action: "face.transfer", target: `teacher:${teacherId}`, detail: { from: w.oldId, key: w.key, how: w.how, score: Math.round(w.score * 100) / 100 } });
      return true;
    });
    if (!moved) continue;
    report.moved++;
    if (w.how === "merge") report.viaMerge++;
  }
  report.waiting = report.old - report.moved;
  log(`faces: ${report.old} old, ${report.moved} moved (${report.viaMerge} via merges), ${report.conflicts} in conflict, ${report.waiting} waiting for the admin`);
  return report;
}
