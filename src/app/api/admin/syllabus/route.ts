import { audit } from "@/server/audit";
import { submitSyllabus, SyllabusError } from "@/server/syllabus-queue";
import { adminActor } from "../auth";

/**
 * The operator's parsed syllabus: `{ courseCode, sourceKey?, fileId?, data }`
 * as JSON, `data` in the SyllabusSchema shape. Stores it for the course page
 * and clears the queue item it answers.
 */
export async function POST(request: Request) {
  const actor = await adminActor(request);
  if (!actor) return new Response(null, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body" }, { status: 400 });
  }
  try {
    const out = await submitSyllabus(body);
    await audit(actor.id, "syllabus.submit", `course:${out.courseCode}`, { sourceKey: out.sourceKey, result: out.result }).catch(() => undefined);
    return Response.json(out);
  } catch (error) {
    if (error instanceof SyllabusError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Syllabus submit failed", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
