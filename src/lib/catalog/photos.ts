import { db } from "@/lib/db";
import { faces } from "@/lib/db/schema";
import { putObject } from "@/lib/storage";
import { nameKey } from "./names";
import type { Teacher } from "./types";

const STAFF_PAGE = "https://newuu.uz/en/employee/faculty-members";
const PHOTO = /<img[^>]+src="(https?:\/\/api\.newuu\.uz\/employee\/image\/[^"]+)"[^>]*alt="([^"]*)"/gi;
const BATCH = 6;

export function parsePhotos(html: string) {
  const found = new Map<string, string>();
  for (const [, url, name] of html.matchAll(PHOTO)) {
    const key = nameKey(name);
    if (key && !found.has(key)) found.set(key, url.replace("http://", "https://"));
  }
  return found;
}

/** Signed links change on every visit; the file name inside them does not. */
export function photoSource(url: string) {
  const token = url.split("/image/")[1]?.split("/")[0] ?? "";
  return Buffer.from(token, "base64").toString("utf8").split("|")[0];
}

async function readPage(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  return response.ok ? response.text() : "";
}

/**
 * University photo links expire within minutes, so they cannot go on the site.
 * Each photo is copied to our storage right after its page is read, and only
 * when it changed. A drawn face is never replaced.
 */
export async function syncPhotos(teachers: Teacher[]) {
  const pages = [...new Set([STAFF_PAGE, ...teachers.flatMap((t) => (t.url ? [t.url] : []))])];
  const photos = new Map<string, string>();
  for (const html of await Promise.all(pages.map(readPage))) {
    for (const [key, url] of parsePhotos(html)) if (!photos.has(key)) photos.set(key, url);
  }

  const known = new Map((await db().select().from(faces)).map((face) => [face.teacherId, face]));
  const jobs = teachers.flatMap((teacher) => {
    const url = photos.get(nameKey(teacher.name));
    const face = known.get(teacher.id);
    return url && !face?.drawn && face?.source !== photoSource(url) ? [{ id: teacher.id, url }] : [];
  });

  for (let start = 0; start < jobs.length; start += BATCH) {
    await Promise.all(jobs.slice(start, start + BATCH).map(async ({ id, url }) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) return;
      const storageKey = await putObject(`faces/${id}.jpg`, Buffer.from(await response.arrayBuffer()), response.headers.get("content-type") ?? "image/jpeg");
      const set = { storageKey, source: photoSource(url), drawn: false, updatedAt: new Date() };
      await db().insert(faces).values({ teacherId: id, ...set }).onConflictDoUpdate({ target: faces.teacherId, set });
    }));
  }
}
