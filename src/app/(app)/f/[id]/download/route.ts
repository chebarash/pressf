import { getUser } from "@/lib/auth";
import { deliverUrl, downloadAllowed, fileSource } from "@/server/covers/source";

/**
 * Download = the branded copy (made once, stored in the bucket), else the
 * original. Signed-in students only — by session cookie, or by the signed link
 * the file page hands out (Telegram's downloader has no cookie). Files never
 * stream through here.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, getUser()]);
  const q = new URL(request.url).searchParams;
  if (!user && !downloadAllowed(id, q.get("exp"), q.get("sig"))) {
    return Response.redirect(new URL(`/sign-in?next=${encodeURIComponent(`/f/${id}`)}`, request.url), 302);
  }
  const src = await fileSource(id, user?.id ?? null);
  if (!src) return new Response("Not found", { status: 404 });
  return Response.redirect(await deliverUrl(src, "attachment"), 302);
}
