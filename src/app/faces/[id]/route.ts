import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { faces } from "@/lib/db/schema";
import { signedUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [face] = await db().select().from(faces).where(eq(faces.teacherId, id));
  if (!face) return new Response(null, { status: 404 });
  return Response.redirect(await signedUrl(face.storageKey), 302);
}
