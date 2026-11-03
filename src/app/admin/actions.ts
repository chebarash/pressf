"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { RejectReason, Trust } from "@/core/uploads";
import { env } from "@/lib/env";
import { authorize } from "@/server/admin/access";
import type { SettingKey } from "@/server/admin/marks";
import { FACE_MAX_BYTES } from "@/core/faces";
import * as faces from "@/server/admin/faces";
import * as ops from "@/server/admin/ops";
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
export const assignOldFace = async (oldId: string, teacherId: string) => run((a) => faces.assignOldFace(a, oldId, teacherId), [`/p/${teacherId}`]);
export const discardOldFace = async (oldId: string) => run((a) => faces.discardOldFace(a, oldId));
export const transferFaces = async () => run((a) => faces.runFaceTransfer(a));

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
