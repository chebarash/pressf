import { eq } from "drizzle-orm";
import { faceContentType } from "@/core/faces";
import { db } from "@/lib/db";
import { faces, teacherAliases } from "@/lib/db/schema";
import { getObject } from "@/lib/storage";

/**
 * A professor's drawn face (never a photo), as bytes. Links carry `?v=<version>`
 * (see `faceUrl`): the matching version is cached for a year, anything else for
 * a few minutes, so a new face shows up as soon as pages link the new version.
 * A merged professor's old id still finds the face.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let [face] = await db().select().from(faces).where(eq(faces.teacherId, id));
  if (!face) {
    const [alias] = await db().select().from(teacherAliases).where(eq(teacherAliases.oldId, id));
    if (alias) [face] = await db().select().from(faces).where(eq(faces.teacherId, alias.teacherId));
  }
  const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  if (!face) return missing();
  const version = face.updatedAt.getTime().toString(36);
  const etag = `"${version}"`;
  const pinned = new URL(request.url).searchParams.get("v") === version;
  const cache = pinned ? "public, max-age=31536000, immutable" : "public, max-age=300, stale-while-revalidate=86400";
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cache } });
  const object = await getObject(face.storageKey);
  if (!object) return missing();
  const type = object.contentType?.startsWith("image/") ? object.contentType : faceContentType(face.storageKey);
  return new Response(Buffer.from(object.body), {
    headers: {
      "Content-Type": type,
      "Cache-Control": cache,
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      // An SVG opened on its own must not run anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
