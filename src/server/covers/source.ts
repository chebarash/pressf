import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { describeFile, TYPE_LABEL, type FileType } from "@/core/files";
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

export type Source = { key: string; name: string; mimeType: string | null; sha256: string; meta: Parameters<typeof brandedCopy>[1] };

export async function fileSource(id: string, userId: string | null): Promise<Source | null> {
  const url = webUrl({ to: "file", id });
  if (UUID.test(id)) {
    const [u] = await db().select().from(uploads).where(eq(uploads.id, id));
    if (!u?.storageKey || (u.status !== "live" && u.uploaderId !== userId)) return null;
    const [c] = u.courseCode ? await db().select({ name: lmsCourses.name }).from(lmsCourses).where(eq(lmsCourses.code, u.courseCode)).limit(1) : [];
    const type = (u.type as FileType) ?? "other";
    return {
      key: u.storageKey, name: u.fileName, mimeType: u.mimeType, sha256: u.sha256,
      meta: { title: u.title, courseName: c?.name ?? u.courseCode ?? "", courseCode: u.courseCode, term: u.term, source: type === "exam" ? "exam" : "students", kind: TYPE_LABEL[type], week: u.week, uploadedAt: u.createdAt, url },
    };
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const [f] = await db().select().from(lmsFiles).where(eq(lmsFiles.id, id));
  if (!f) return null;
  const [c] = await db().select({ name: lmsCourses.name }).from(lmsCourses).where(eq(lmsCourses.id, f.courseId));
  const name = f.extension && !f.name.toLowerCase().endsWith(`.${f.extension.toLowerCase()}`) ? `${f.name}.${f.extension}` : f.name;
  const meta = describeFile(f.name, { courseCode: f.code, courseName: c?.name, extension: f.extension ?? undefined });
  return {
    key: f.storageKey, name, mimeType: f.mimeType,
    // LMS files have no content hash; the id and LMS version identify the bytes.
    sha256: createHash("sha256").update(`lms:${f.id}:${f.version ?? f.fetchedAt.toISOString()}`).digest("hex"),
    meta: { title: meta.title, courseName: c?.name ?? f.code, courseCode: f.code, source: "lms", kind: TYPE_LABEL[meta.type], week: meta.week, uploadedAt: f.fetchedAt, url },
  };
}


/** Signed URL of the branded copy, or of the original when the format gets no cover (or branding fails, which is logged). */
export async function deliverUrl(src: Source) {
  const copy = await brandedCopy(
    {
      sha256: src.sha256, name: src.name, mimeType: src.mimeType,
      load: async () => {
        const res = await fetch(await signedUrl(src.key));
        if (!res.ok) throw new Error(`bucket answered ${res.status} for ${src.key}`);
        return new Uint8Array(await res.arrayBuffer());
      },
    },
    src.meta,
  ).catch((error) => {
    console.error("Cover failed, sending the original", src.key, error instanceof Error ? error.message : error);
    return null;
  });
  return copy?.url ?? (await signedUrl(src.key, src.name));
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
