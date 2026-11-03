import { planImport } from "@/server/import";
import { failed, importActor, readImport } from "../request";

/** What one file of a channel export looks like (course, type, term, title, duplicates, flags). Writes nothing. */
export async function POST(request: Request) {
  if (!(await importActor(request))) return new Response(null, { status: 401 });
  try {
    const { meta, bytes } = await readImport(request, false);
    return Response.json(await planImport(meta, bytes));
  } catch (error) {
    return failed(error);
  }
}
