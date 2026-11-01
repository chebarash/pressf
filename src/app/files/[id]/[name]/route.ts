import { publishedFile } from "@/lib/content";
import { signedUrl } from "@/lib/storage";

/**
 * A lasting address that ends in the file name, which Telegram needs to send a
 * document by URL. It passes byte ranges through, so a reader can open a 1,800
 * page book without fetching all of it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await publishedFile(id);
  if (!file) return new Response(null, { status: 404 });
  const range = request.headers.get("range");
  const upstream = await fetch(await signedUrl(file.storageKey!, file.fileName), range ? { headers: { range } } : undefined);
  if (!upstream.ok) return new Response(null, { status: upstream.status === 416 ? 416 : 502 });
  const headers = new Headers({
    "Content-Type": file.mimeType,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    "Cache-Control": "public, max-age=3600",
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "https://web.telegram.org",
  });
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
