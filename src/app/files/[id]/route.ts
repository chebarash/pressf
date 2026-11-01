import { publishedFile } from "@/lib/content";
import { signedUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await publishedFile(id);
  if (!file) return new Response(null, { status: 404 });
  return Response.redirect(await signedUrl(file.storageKey!, file.fileName), 302);
}
