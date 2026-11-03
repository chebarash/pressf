import { parseNotionFace } from "@/core/notion-faces";
import { getUser } from "@/lib/auth";
import { authorize } from "@/server/admin/access";
import { previewNotionFace } from "@/server/notion-faces";

/**
 * A Notion Faces face drawn from its parameters (`?face=s5e37y0b16n7m46h107a0`,
 * see notionFacePreviewUrl): the same PNG "Use this face" saves. Admins only
 * (it costs a little CPU); everyone else gets a 404, like the rest of /admin.
 */
export async function GET(request: Request) {
  const notFound = () => new Response(null, { status: 404 });
  const user = await getUser();
  if (!user) return notFound();
  try {
    await authorize(user.id, "admin:catalog");
  } catch {
    return notFound();
  }
  const face = parseNotionFace(new URL(request.url).searchParams.get("face") ?? "");
  if (!face) return new Response("Not a face", { status: 400 });
  const png = await previewNotionFace(face);
  return new Response(Buffer.from(png), {
    headers: {
      "Content-Type": "image/png",
      // The same parameters always draw the same picture.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
