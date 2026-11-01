import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { materials } from "@/lib/db/schema";
import { signedUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const [file] = await db().select().from(materials).where(eq(materials.id, id));
  if (!file?.storageKey || file.status !== "approved") return new Response(null, { status: 404 });
  return Response.redirect(await signedUrl(file.storageKey, file.fileName), 302);
}
