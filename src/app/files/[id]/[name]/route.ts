import { publishedFile } from "@/lib/content";
import { signedUrl } from "@/lib/storage";

/** A lasting address that ends in the file name, which Telegram needs to send a document by URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await publishedFile(id);
  if (!file) return new Response(null, { status: 404 });
  const upstream = await fetch(await signedUrl(file.storageKey!, file.fileName));
  if (!upstream.ok) return new Response(null, { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
