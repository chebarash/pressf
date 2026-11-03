import { commitImport, ImportError } from "@/server/import";
import { audit } from "@/server/audit";
import { failed, importActor, readImport } from "../request";

/** Publishes one reviewed file of a channel export; the same post again updates its row. */
export async function POST(request: Request) {
  const actor = await importActor(request);
  if (!actor) return new Response(null, { status: 401 });
  try {
    const { meta, bytes, decision } = await readImport(request, true);
    if (!bytes) throw new ImportError("A file is required");
    const out = await commitImport(meta, bytes, decision!, actor.id);
    if (out.result === "created" || out.result === "updated") {
      await audit(actor.id, "upload.import", out.id, { sourceKey: out.sourceKey, course: out.courseCode, result: out.result }).catch(() => undefined);
    }
    return Response.json(out);
  } catch (error) {
    return failed(error);
  }
}
