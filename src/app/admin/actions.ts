"use server";

import { after } from "next/server";
import { revalidatePath, updateTag } from "next/cache";
import type { RejectReason, Trust } from "@/core/uploads";
import { env } from "@/lib/env";
import { authorize } from "@/server/admin/access";
import type { SettingKey } from "@/server/admin/marks";
import type { FaceSpec } from "@/core/face-parts";
import { FACE_MAX_BYTES } from "@/core/faces";
import { PHOTO_MAX_BYTES } from "@/lib/face-photo";
import { COVERAGE_TAG, moveCourse as moveCourseOp } from "@/server/admin/coverage";
import * as faces from "@/server/admin/faces";
import * as ops from "@/server/admin/ops";
import * as profiles from "@/server/admin/profiles";
import type { ProfileFields } from "@/core/faculty";
import type { Audience } from "@/server/admin/rules";
import { actorId } from "@/server/admin/viewer";
import { audienceSize } from "@/server/admin/views";

export type Result = { ok: true; message?: string } | { ok: false, error: string };

/** Runs an op as the signed-in user; turns known failures into a message for the UI. */
async function run(fn: (actor: string) => Promise<unknown>, paths: string[] = []): Promise<Result> {
  try {
    const actor = await actorId();
    const out = await fn(actor);
    revalidatePath("/admin", "layout");
    for (const p of paths) revalidatePath(p);
    return { ok: true, message: typeof out === "object" && out && "message" in out ? String((out as { message: unknown }).message) : undefined };
  } catch (e) {
    if (e instanceof ops.Forbidden) return { ok: false, error: "You don't have access to this" };
    if (e instanceof ops.AdminError) return { ok: false, error: e.message };
    if (e instanceof Error && /changed while reviewing|Cannot move/.test(e.message)) return { ok: false, error: "Someone else already reviewed this — reload" };
    console.error("admin action failed", e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export const publishUpload = async (id: string, edits: Parameters<typeof ops.publishUpload>[2]) => run((a) => ops.publishUpload(a, id, edits));
export const hideLiveUpload = async (id: string) => run((a) => ops.hideLiveUpload(a, id));
export const rejectUpload = async (id: string, reason: RejectReason, note: string) => run((a) => ops.rejectUpload(a, id, reason, note));

export const resolveReport = async (kind: "post" | "file", id: string, outcome: ops.ReportOutcome) => run((a) => ops.resolveReport(a, { kind, id }, outcome));

export const editFile = async (ref: ops.FileRef, patch: Parameters<typeof ops.editFile>[2]) => run((a) => ops.editFile(a, ref, patch));
export const bulkFiles = async (refs: ops.FileRef[], op: Parameters<typeof ops.bulkFiles>[2]) => run((a) => ops.bulkFiles(a, refs, op));

export const mergeTeachers = async (keepId: string, mergeId: string) => run((a) => ops.mergeTeachers(a, keepId, mergeId));
export const markNotTwins = async (a: string, b: string) => run((actor) => ops.markNotTwins(actor, a, b));

/** Coverage: an admin moves a course to a school/department (null school: back to automatic). Shown right away. */
export const moveCourse = async (code: string, school: string | null, department: string | null) =>
  run(async (a) => {
    const out = await moveCourseOp(a, { code, school, department });
    updateTag(COVERAGE_TAG);
    return out;
  }, ["/admin/coverage"]);

/** Professor profiles (admin only, checked again inside each op). */
export const saveProfile = async (teacherId: string, fields: Partial<ProfileFields>) => run((a) => profiles.saveProfile(a, teacherId, fields), [`/p/${teacherId}`]);
export const resetProfile = async (teacherId: string) => run((a) => profiles.resetProfile(a, teacherId), [`/p/${teacherId}`]);
export const assignNewuuPerson = async (siteId: number, teacherId: string) => run((a) => profiles.assignPerson(a, siteId, teacherId), [`/p/${teacherId}`]);
export const dismissNewuuPerson = async (siteId: number) => run((a) => profiles.dismissPerson(a, siteId));
export const importNewuu = async () => run((a) => profiles.startImport(a, (job) => after(job)));

/** Drawn faces (admin only, checked again inside each op). The file comes as form data: `teacherId`, `file`. */
export async function uploadFace(form: FormData): Promise<Result> {
  const teacherId = String(form.get("teacherId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Pick a PNG or SVG drawing" };
  if (file.size > FACE_MAX_BYTES) return { ok: false, error: "Faces are line drawings: keep the file under 512 KB" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  return run((a) => faces.setFace(a, teacherId, bytes), [`/p/${teacherId}`]);
}
export const removeFace = async (teacherId: string) => run((a) => faces.removeFace(a, teacherId), [`/p/${teacherId}`]);
/** A face from the constructor: the server draws the SVG from the parts and saves it like an upload. */
export const buildFace = async (teacherId: string, spec: unknown) => run((a) => faces.buildFace(a, teacherId, spec), [`/p/${teacherId}`]);

export type PhotoResult = { ok: true; spec: Omit<FaceSpec, "tone">; note: string } | { ok: false; error: string };
/**
 * Picks constructor parts from a photo (`photo` in form data). The photo is
 * read into memory for this request only: never stored, logged or cached.
 */
export async function faceFromPhoto(form: FormData): Promise<PhotoResult> {
  const file = form.get("photo");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Pick a photo" };
  if (file.size > PHOTO_MAX_BYTES) return { ok: false, error: "Photos up to 8 MB" };
  try {
    const actor = await actorId();
    const out = await faces.faceFromPhoto(actor, new Uint8Array(await file.arrayBuffer()));
    return { ok: true, spec: out.spec, note: out.note };
  } catch (e) {
    if (e instanceof ops.Forbidden) return { ok: false, error: "You don't have access to this" };
    if (e instanceof ops.AdminError) return { ok: false, error: e.message };
    // No error details: they could carry the request.
    console.error("face from photo failed");
    return { ok: false, error: "Something went wrong. Build the face by hand." };
  }
}

export const setTrust = async (userId: string, trust: Trust) => run((a) => ops.setTrust(a, userId, trust));
export const setPersonRole = async (userId: string, role: "student" | "moderator") => run((a) => ops.setPersonRole(a, userId, role));
export const signOutEverywhere = async (userId: string) => run((a) => ops.signOutEverywhere(a, userId));
export const messageInBot = async (userId: string, text: string) => run((a) => ops.messageInBot(a, userId, text));

export const scheduleBroadcast = async (input: ops.BroadcastInput) => run((a) => ops.scheduleBroadcast(a, input));
export const sendTestBroadcast = async (input: ops.BroadcastInput) => run((a) => ops.sendTestBroadcast(a, input));

/** Live audience count for the composer. Counts only; needs the broadcast permission. */
export async function countAudience(audience: Audience) {
  await authorize(await actorId(), "admin:broadcast");
  return audienceSize(audience);
}

export const setSetting = async (key: SettingKey, on: boolean) => run((a) => ops.setSetting(a, key, on));

export const runJob = async (job: ops.Job) =>
  run((a) =>
    ops.runJob(a, job, async (j) => {
      const base = env().NEXTAUTH_URL ?? "http://localhost:3000";
      after(() => fetch(`${base}/api/cron/${j}`, { method: "POST", headers: { authorization: `Bearer ${env().CRON_SECRET ?? ""}` } }).catch(() => {}));
    })
  );
