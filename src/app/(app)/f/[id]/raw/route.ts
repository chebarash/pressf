import { getUser } from "@/lib/auth";
import { deliverUrl, downloadAllowed, fileSource } from "@/server/covers/source";

/**
 * The same bytes as /download (the branded copy, else the original), served
 * from our origin for the in-page PDF viewer: pdf.js fetches the file from
 * script, which needs CORS on a cross-origin bucket URL; same origin needs none. Same access as /download —
 * session cookie or the signed link. The body is piped, never buffered.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, getUser()]);
  const q = new URL(request.url).searchParams;
  if (!user && !downloadAllowed(id, q.get("exp"), q.get("sig"))) return new Response("Sign in to open this file", { status: 401 });
  const src = await fileSource(id, user?.id ?? null);
  if (!src) return new Response("Not found", { status: 404 });
  const res = await fetch(await deliverUrl(src));
  if (!res.ok || !res.body) return new Response("File unavailable", { status: 502 });
  const headers = new Headers({
    "Content-Type": res.headers.get("content-type") ?? src.mimeType ?? "application/octet-stream",
    "Content-Disposition": "inline",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  const length = res.headers.get("content-length");
  if (length && !res.headers.get("content-encoding")) headers.set("Content-Length", length);
  return new Response(res.body, { headers });
}
