import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { teacherNamesByCode } from "@/server/views/shared";
import { eq } from "drizzle-orm";
import { describeFile, downloadName, formatOf, TYPE_LABEL, type FileType } from "@/core/files";
import { fileOverride, overlay } from "@/server/decisions";
import { webUrl } from "@/core/links";
import { db } from "@/lib/db";
import { lmsCourses, lmsFiles, uploads } from "@/lib/db/schema";
import { signedUrl } from "@/lib/storage";
import { linkSecret } from "@/server/identity";
import { brandedCopy } from "./store";

/**
 * One way to get a file's bytes with the Press F cover, for the web download
 * and the bot alike: the stored branded copy (made once), else the original.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `name` is the stored file's own name (it decides the format); `downloadName`
 * is what the student gets: the title shown on the site and the course,
 * "Lectures 9–10 — Deep Learning.pdf", never the LMS's "Week_5_L910_v5.pdf".
 */
export type Source = { key: string; name: string; downloadName: string; mimeType: string | null; sha256: string; meta: Parameters<typeof brandedCopy>[1] };

const extOf = (name: string) => name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase() ?? "";

export async function fileSource(id: string, userId: string | null): Promise<Source | null> {
  const url = webUrl({ to: "file", id });
  if (UUID.test(id)) {
    const [u] = await db().select().from(uploads).where(eq(uploads.id, id));
    if (!u?.storageKey || (u.status !== "live" && u.uploaderId !== userId)) return null;
    const [c] = u.courseCode ? await db().select({ name: lmsCourses.name }).from(lmsCourses).where(eq(lmsCourses.code, u.courseCode)).limit(1) : [];
    const type = (u.type as FileType) ?? "other";
    const courseName = c?.name ?? u.courseCode ?? "";
    return {
      key: u.storageKey, name: u.fileName, downloadName: downloadName(u.title, courseName, formatOf(u.fileName), extOf(u.fileName)), mimeType: u.mimeType, sha256: u.sha256,
      meta: { title: u.title, courseName: c?.name ?? u.courseCode ?? "", courseCode: u.courseCode, term: u.term, source: type === "exam" ? "exam" : "students", kind: TYPE_LABEL[type], week: u.week, uploadedAt: u.createdAt, channel: u.sourceLabel, url },
    };
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const [[f], edit] = await Promise.all([db().select().from(lmsFiles).where(eq(lmsFiles.id, id)), fileOverride(id)]);
  if (!f || edit?.hidden) return null;
  const [c] = await db().select({ name: lmsCourses.name }).from(lmsCourses).where(eq(lmsCourses.id, f.courseId));
  const name = f.extension && !f.name.toLowerCase().endsWith(`.${f.extension.toLowerCase()}`) ? `${f.name}.${f.extension}` : f.name;
  const meta = describeFile(f.name, { courseCode: f.code, courseName: c?.name, extension: f.extension ?? undefined, teachers: (await teacherNamesByCode())[f.code ?? ""] });
  // The admin's corrected title wins, as on the file page.
  const shown = overlay({ title: meta.title, type: meta.type, week: meta.week }, edit) ?? meta;
  return {
    key: f.storageKey, name, downloadName: downloadName(shown.title, c?.name ?? f.code ?? "", meta.format, (f.extension ?? "").toLowerCase() || extOf(f.name)), mimeType: f.mimeType,
    // LMS files have no content hash; the id and LMS version identify the bytes.
    sha256: createHash("sha256").update(`lms:${f.id}:${f.version ?? f.fetchedAt.toISOString()}`).digest("hex"),
    meta: { title: shown.title, courseName: c?.name ?? f.code, courseCode: f.code, source: "lms", kind: TYPE_LABEL[shown.type], week: shown.week, uploadedAt: f.fetchedAt, url },
  };
}


/** Signed URL of the branded copy, or of the original when the format gets no cover (or branding fails, which is logged). */
export async function deliverUrl(src: Source, disposition: "inline" | "attachment" = "inline") {
  const copy = await brandedCopy(
    {
      sha256: src.sha256, name: src.downloadName, mimeType: src.mimeType,
      load: async () => {
        const res = await fetch(await signedUrl(src.key));
        if (!res.ok) throw new Error(`bucket answered ${res.status} for ${src.key}`);
        return new Uint8Array(await res.arrayBuffer());
      },
    },
    src.meta,
    { disposition },
  ).catch((error) => {
    console.error("Cover failed, sending the original", src.key, error instanceof Error ? error.message : error);
    return null;
  });
  return copy?.url ?? (await signedUrl(src.key, src.downloadName, disposition));
}

/**
 * The Download link for a signed-in viewer: /f/<id>/download with a signature
 * valid for an hour. Telegram's downloadFile fetches it from the native client,
 * which has no session cookie, so the signature stands in for the sign-in (it
 * grants what the signed bucket URL on the same page already grants).
 */
const DOWNLOAD_TTL_S = 3600;
const downloadSig = (id: string, exp: number) => createHmac("sha256", linkSecret()).update(`download:${id}:${exp}`).digest("base64url").slice(0, 32);

export function downloadLink(id: string, now = new Date()) {
  const base = `/f/${encodeURIComponent(id)}/download`;
  try {
    const exp = Math.floor(now.getTime() / 1000) + DOWNLOAD_TTL_S;
    return `${base}?exp=${exp}&sig=${downloadSig(id, exp)}`;
  } catch {
    return base; // no secret configured: the cookie still works in a browser
  }
}

export function downloadAllowed(id: string, exp: string | null, sig: string | null, now = new Date()) {
  const e = Number(exp);
  if (!sig || !Number.isInteger(e) || e < now.getTime() / 1000) return false;
  try {
    const want = Buffer.from(downloadSig(id, e));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}
