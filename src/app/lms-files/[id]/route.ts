import { eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { lmsFiles } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { signedUrl } from "@/lib/storage";

/** A harvested LMS file, for signed-in students only; a guest gets no URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.redirect(new URL("/sign-in", env().NEXTAUTH_URL), 302);
  const { id } = await params;
  const [file] = await db().select().from(lmsFiles).where(eq(lmsFiles.id, id));
  if (!file) return new Response(null, { status: 404 });
  return Response.redirect(await signedUrl(file.storageKey, file.name), 302);
}
