/**
 * Every admin and moderator write. Each function takes the actor's user id,
 * checks the role on the server (never trusting the UI), does the change and
 * writes the audit log. Server actions in src/app/admin call these.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { REJECT_REASONS, UPLOAD_TYPES, type RejectReason, type Trust } from "@/core/uploads";
import { db } from "@/lib/db";
import { broadcasts, courseRatings, fileOverrides, lmsCourses, lmsCourseTeachers, lmsFiles, teacherAliases, teacherRatings, uploads, userRoles } from "@/lib/db/schema";
import { audit } from "@/server/audit";
import { setRole } from "@/server/identity";
import { resolve, type ReportTarget } from "@/server/reports";
import { hide as hideUpload, publish, reject, trustFor } from "@/server/uploads";
import { authorize, Forbidden } from "./access";
import { clearMark, pairKey, setMark, type SettingKey } from "./marks";
import { notifyUploader } from "@/lib/telegram/notify";
import { messageUserHook } from "./notify";
import { dayClash, MUTE_DAYS, nextSendable, type Audience } from "./rules";

export { Forbidden };
export class AdminError extends Error {}

const uuid = z.string().uuid();
const FILE_TYPES = ["lecture", "practice", "lab", "exam", "mock", "notes", "assignment", "syllabus", "book", "other"] as const;

/* ───────── Uploads ───────── */

export const uploadEdits = z
  .object({
    title: z.string().trim().min(1).max(200),
    type: z.enum(UPLOAD_TYPES as [string, ...string[]]),
    courseId: z.string().min(1).max(40),
    courseCode: z.string().max(40).nullable(),
    week: z.number().int().min(1).max(20).nullable(),
    term: z.string().max(40).nullable(),
    exam: z.string().max(40).nullable(),
  })
  .partial();

/** The course name the student sees in the bot message (same as the admin preview). */
async function courseNameOf(courseId: string) {
  const [row] = await db().select({ name: lmsCourses.name }).from(lmsCourses).where(eq(lmsCourses.id, courseId));
  return row?.name ?? "";
}

export async function publishUpload(actorId: string, id: string, edits: z.input<typeof uploadEdits> = {}) {
  await authorize(actorId, "moderate:uploads");
  const clean = uploadEdits.parse(edits);
  const [row] = await db().select({ courseId: uploads.courseId }).from(uploads).where(eq(uploads.id, uuid.parse(id)));
  if (!row) throw new AdminError("Upload not found");
  const { upload, message } = await publish(id, actorId, clean, await courseNameOf(clean.courseId ?? row.courseId));
  await notifyUploader(upload.id, message);
  return { id: upload.id, message };
}

export async function rejectUpload(actorId: string, id: string, reason: RejectReason, note = "") {
  await authorize(actorId, "moderate:uploads");
  if (!(reason in REJECT_REASONS)) throw new AdminError("Pick a reason");
  if (reason === "other" && !note.trim()) throw new AdminError("Write a note for the student");
  const [row] = await db().select({ courseId: uploads.courseId }).from(uploads).where(eq(uploads.id, uuid.parse(id)));
  if (!row) throw new AdminError("Upload not found");
  const { upload, message } = await reject(id, actorId, reason, note.trim().slice(0, 500), await courseNameOf(row.courseId));
  await notifyUploader(upload.id, message);
  return { id: upload.id, message };
}

/** Takes a live student file down (spot check in Live). */
export async function hideLiveUpload(actorId: string, id: string) {
  await authorize(actorId, "moderate:uploads");
  await hideUpload(uuid.parse(id), actorId);
}

/* ───────── Reports ───────── */

export type ReportOutcome = "hide" | "mute" | "keep";

/**
 * Hide, hide + mute (posts only) or keep. A mute is recorded on the post: the
 * posting flow maps the post to its private author token, so nobody here ever
 * learns who wrote it.
 */
export async function resolveReport(actorId: string, target: ReportTarget, outcome: ReportOutcome) {
  await authorize(actorId, "moderate:reports");
  const t = { kind: z.enum(["post", "file"]).parse(target.kind), id: z.string().min(1).max(80).parse(target.id) };
  if (outcome === "mute" && t.kind !== "post") throw new AdminError("Only an Anonymous post's author can be muted");
  if (outcome === "keep") {
    await resolve(t, "kept", actorId);
    return;
  }
  if (t.kind === "file") {
    const [row] = await db().select({ status: uploads.status }).from(uploads).where(eq(uploads.id, uuid.parse(t.id)));
    if (row?.status === "live") await hideUpload(t.id, actorId);
  } else {
    await setMark("post-hidden", t.id, actorId);
  }
  await resolve(t, "hidden", actorId);
  if (outcome === "mute") {
    const until = new Date(Date.now() + MUTE_DAYS * 86_400_000);
    await setMark("post-mute", t.id, actorId, { until });
    await audit(actorId, "post.mute", `post:${t.id}`, { days: MUTE_DAYS });
  }
}

/* ───────── Courses & files ───────── */

const filePatch = z.object({ title: z.string().trim().min(1).max(200), type: z.enum(FILE_TYPES), week: z.number().int().min(1).max(20).nullable() }).partial();

export type FileRef = { source: "lms" | "students"; id: string };

/** Rename, retype or move one file. LMS files keep the edit across re-syncs. */
export async function editFile(actorId: string, ref: FileRef, patch: z.input<typeof filePatch>) {
  await authorize(actorId, "admin:catalog");
  const p = filePatch.parse(patch);
  if (!Object.keys(p).length) return;
  if (ref.source === "students") {
    const set: Partial<typeof uploads.$inferInsert> = {};
    if (p.title !== undefined) set.title = p.title;
    if (p.type !== undefined) set.type = p.type;
    if (p.week !== undefined) set.week = p.week;
    await db().update(uploads).set(set).where(eq(uploads.id, uuid.parse(ref.id)));
  } else {
    const [exists] = await db().select({ id: lmsFiles.id }).from(lmsFiles).where(eq(lmsFiles.id, ref.id));
    if (!exists) throw new AdminError("File not found");
    await db()
      .insert(fileOverrides)
      .values({ fileId: ref.id, ...p, updatedBy: actorId })
      .onConflictDoUpdate({ target: fileOverrides.fileId, set: { ...p, updatedBy: actorId, updatedAt: new Date() } });
  }
  await audit(actorId, "file.edit", `${ref.source}:${ref.id}`, { fields: Object.keys(p), ...p });
}

/** Bulk: move several files to a week, or hide / show them. */
export async function bulkFiles(actorId: string, refs: FileRef[], op: { week: number | null } | { hidden: boolean }) {
  await authorize(actorId, "admin:catalog");
  if (!refs.length || refs.length > 500) throw new AdminError("Select files first");
  const lmsIds = refs.filter((r) => r.source === "lms").map((r) => r.id);
  const studentIds = refs.filter((r) => r.source === "students").map((r) => uuid.parse(r.id));
  await db().transaction(async (tx) => {
    if ("week" in op) {
      const week = op.week === null ? null : z.number().int().min(1).max(20).parse(op.week);
      if (studentIds.length) await tx.update(uploads).set({ week }).where(inArray(uploads.id, studentIds));
      for (const fileId of lmsIds)
        await tx.insert(fileOverrides).values({ fileId, week, updatedBy: actorId }).onConflictDoUpdate({ target: fileOverrides.fileId, set: { week, updatedBy: actorId, updatedAt: new Date() } });
    } else {
      if (studentIds.length)
        await tx
          .update(uploads)
          .set({ status: op.hidden ? "hidden" : "live", reviewedBy: actorId, reviewedAt: new Date() })
          .where(and(inArray(uploads.id, studentIds), eq(uploads.status, op.hidden ? "live" : "hidden")));
      for (const fileId of lmsIds)
        await tx
          .insert(fileOverrides)
          .values({ fileId, hidden: op.hidden, updatedBy: actorId })
          .onConflictDoUpdate({ target: fileOverrides.fileId, set: { hidden: op.hidden, updatedBy: actorId, updatedAt: new Date() } });
    }
  });
  await audit(actorId, "week" in op ? "file.move" : op.hidden ? "file.hide" : "file.show", undefined, { count: refs.length, ...op, files: refs.map((r) => `${r.source}:${r.id}`) });
}

/* ───────── Professors ───────── */

/**
 * Merges `mergeId` into `keepId`: ratings move over (a student who rated both
 * keeps only the newest), course roles move, and the old id redirects.
 */
export async function mergeTeachers(actorId: string, keepId: string, mergeId: string) {
  await authorize(actorId, "admin:catalog");
  if (!keepId || !mergeId || keepId === mergeId) throw new AdminError("Pick two different professors");
  const doubles = await db().transaction(async (tx) => {
    // Rater-level double votes: the same pseudonymous rater rated both, same role.
    const both = await tx.execute<{ rating_id: string; teacher_id: string; role: string }>(sql`
      with r as (
        select tr.rating_id, tr.teacher_id, tr.role, cr.rater, cr.updated_at
        from ${teacherRatings} tr join ${courseRatings} cr on cr.id = tr.rating_id
        where tr.teacher_id in (${keepId}, ${mergeId})
      ), twice as (
        select rater, role from r group by rater, role having count(distinct teacher_id) > 1
      ), ranked as (
        select r.*, row_number() over (partition by r.rater, r.role order by r.updated_at desc) as n
        from r join twice t on t.rater = r.rater and t.role = r.role
      )
      select rating_id, teacher_id, role from ranked where n > 1`);
    for (const d of both.rows)
      await tx.delete(teacherRatings).where(and(eq(teacherRatings.ratingId, d.rating_id), eq(teacherRatings.teacherId, d.teacher_id), eq(teacherRatings.role, d.role)));
    // Same rating listing both teachers in one role cannot both survive the PK.
    await tx.execute(sql`
      delete from ${teacherRatings} m using ${teacherRatings} k
      where m.teacher_id = ${mergeId} and k.teacher_id = ${keepId} and m.rating_id = k.rating_id and m.role = k.role`);
    await tx.update(teacherRatings).set({ teacherId: keepId }).where(eq(teacherRatings.teacherId, mergeId));
    await tx.execute(sql`
      insert into ${lmsCourseTeachers} (course_id, teacher_id, role)
      select course_id, ${keepId}, role from ${lmsCourseTeachers} where teacher_id = ${mergeId}
      on conflict do nothing`);
    await tx.delete(lmsCourseTeachers).where(eq(lmsCourseTeachers.teacherId, mergeId));
    await tx.update(teacherAliases).set({ teacherId: keepId }).where(eq(teacherAliases.teacherId, mergeId));
    await tx.insert(teacherAliases).values({ oldId: mergeId, teacherId: keepId }).onConflictDoUpdate({ target: teacherAliases.oldId, set: { teacherId: keepId } });
    return both.rows.length;
  });
  await audit(actorId, "teacher.merge", `teacher:${keepId}`, { merged: mergeId, doubleVotesDropped: doubles });
  return { doubles };
}

export async function markNotTwins(actorId: string, a: string, b: string) {
  await authorize(actorId, "admin:catalog");
  await setMark("teachers-distinct", pairKey(a, b), actorId);
  await audit(actorId, "teacher.distinct", `teacher:${a}`, { other: b });
}

/* ───────── People ───────── */

export async function setTrust(actorId: string, userId: string, trust: Trust) {
  await authorize(actorId, "admin:people");
  const level = z.enum(["normal", "trusted", "paused"]).parse(trust);
  const from = await trustFor(uuid.parse(userId));
  await db()
    .insert(userRoles)
    .values({ userId, manualTrust: level })
    .onConflictDoUpdate({ target: userRoles.userId, set: { manualTrust: level, updatedAt: new Date() } });
  await audit(actorId, "trust.change", `user:${userId}`, { from, to: level });
}

export async function setPersonRole(actorId: string, userId: string, role: "student" | "moderator") {
  await authorize(actorId, "admin:people");
  const r = z.enum(["student", "moderator"]).parse(role);
  if (userId === actorId) throw new AdminError("You can't change your own role");
  await setRole(uuid.parse(userId), r);
  await audit(actorId, "role.change", `user:${userId}`, { to: r });
}

/** Voids every session of the user; the auth layer checks `sessionsRevokedAt`. */
export async function signOutEverywhere(actorId: string, userId: string) {
  await authorize(actorId, "admin:people");
  await setMark("signout", uuid.parse(userId), actorId);
  await audit(actorId, "user.signout", `user:${userId}`);
}

export async function messageInBot(actorId: string, userId: string, text: string) {
  await authorize(actorId, "admin:people");
  const body = z.string().trim().min(1).max(1000).parse(text);
  const sent = await messageUserHook(uuid.parse(userId), body);
  await audit(actorId, "user.message", `user:${userId}`, { sent, length: body.length });
  if (!sent) throw new AdminError("This student hasn't linked the bot");
}

/* ───────── Broadcasts ───────── */

export const broadcastInput = z.object({
  audience: z.object({
    years: z.array(z.number().int().min(1).max(6)).max(6).optional(),
    schools: z.array(z.string().max(80)).max(10).optional(),
    courseIds: z.array(z.string().max(40)).max(20).optional(),
    unrated: z.string().max(40).optional(),
  }),
  text: z.string().trim().min(1).max(1000),
  button: z.object({ label: z.string().trim().min(1).max(40), target: z.string().trim().regex(/^\/[\w\-/?=&.]*$/).max(200) }).nullable(),
  bannerUntil: z.coerce.date().nullable(),
  sendAt: z.coerce.date(),
});
export type BroadcastInput = z.input<typeof broadcastInput>;

/** Schedules a broadcast: never in quiet hours, at most one per student per day. */
export async function scheduleBroadcast(actorId: string, input: BroadcastInput, now = new Date()) {
  await authorize(actorId, "admin:broadcast");
  const b = broadcastInput.parse(input);
  const sendAt = nextSendable(b.sendAt < now ? now : b.sendAt);
  const pending = await db()
    .select({ id: broadcasts.id, sendAt: broadcasts.sendAt, audience: broadcasts.audience, text: broadcasts.text })
    .from(broadcasts)
    .where(gte(broadcasts.sendAt, new Date(sendAt.getTime() - 2 * 86_400_000)));
  const clash = dayClash(pending as Array<{ sendAt: Date; audience: Audience; text: string }>, { sendAt, audience: b.audience });
  if (clash) throw new AdminError(`These students already get a broadcast that day: "${clash.text.slice(0, 40)}"`);
  const [row] = await db()
    .insert(broadcasts)
    .values({ audience: b.audience, text: b.text, button: b.button, bannerUntil: b.bannerUntil, sendAt, createdBy: actorId })
    .returning({ id: broadcasts.id, sendAt: broadcasts.sendAt });
  await audit(actorId, "broadcast.schedule", `broadcast:${row.id}`, { sendAt: row.sendAt.toISOString(), text: b.text.slice(0, 80) });
  return row;
}

export async function sendTestBroadcast(actorId: string, input: BroadcastInput) {
  await authorize(actorId, "admin:broadcast");
  const b = broadcastInput.parse(input);
  const sent = await messageUserHook(actorId, b.button ? `${b.text}\n\n[${b.button.label}]` : b.text);
  if (!sent) throw new AdminError("Link your Telegram to get test messages");
}

/* ───────── System ───────── */

export const JOBS = ["sync", "harvest"] as const;
export type Job = (typeof JOBS)[number];

/** Starts a background job now through its cron endpoint. */
export async function runJob(actorId: string, job: Job, trigger: (job: Job) => Promise<void>) {
  await authorize(actorId, "admin:system");
  const j = z.enum(JOBS).parse(job);
  await audit(actorId, "job.run", `job:${j}`);
  await trigger(j);
}

export async function setSetting(actorId: string, key: SettingKey, on: boolean) {
  await authorize(actorId, "admin:system");
  const k = z.enum(["maintenance", "sync-paused"]).parse(key);
  if (on) await setMark("setting", k, actorId);
  else await clearMark("setting", k);
  await audit(actorId, on ? "setting.on" : "setting.off", `setting:${k}`);
}
