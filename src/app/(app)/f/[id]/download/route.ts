import { getUser } from "@/lib/auth";
import { deliverUrl, fileSource } from "@/server/covers/source";

/**
 * Download = the branded copy (made once, stored in the bucket), else the
 * original. Signed-in students only; files never stream through here.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, getUser()]);
  if (!user) return Response.redirect(new URL(`/sign-in?next=${encodeURIComponent(`/f/${id}`)}`, _request.url), 302);
  const src = await fileSource(id, user.id);
  if (!src) return new Response("Not found", { status: 404 });
  return Response.redirect(await deliverUrl(src), 302);
}
