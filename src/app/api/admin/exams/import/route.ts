import { audit } from "@/server/audit";
import { importJson } from "@/server/exam-import";
import { ExamError } from "@/server/exams";
import { importActor } from "../../import/request";

/**
 * Stores an exam schedule the operator already read (JSON, see src/server/exam-import.ts).
 * `Authorization: Bearer <CRON_SECRET>` (scripts/exams-import.ts) or a signed-in admin.
 * Re-posting the same source replaces its rows; students whose exam moved are told once.
 */
export async function POST(request: Request) {
  const actor = await importActor(request);
  if (!actor) return new Response(null, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send the schedule as JSON" }, { status: 400 });
  }
  try {
    const out = await importJson(body, actor.id);
    await audit(actor.id, "exams.import", out.sourceId, { exams: out.stats.exams, users: out.stats.usersMatched }).catch(() => undefined);
    return Response.json(out);
  } catch (error) {
    if (error instanceof ExamError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Exam import failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
