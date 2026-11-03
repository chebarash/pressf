import { syllabusQueueItems } from "@/server/syllabus-queue";
import { adminActor } from "../../auth";

/** The syllabus files waiting for the operator, each with a download link valid for an hour. */
export async function GET(request: Request) {
  if (!(await adminActor(request))) return new Response(null, { status: 401 });
  try {
    const items = await syllabusQueueItems({ withUrls: true });
    return Response.json({ count: items.length, items }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Syllabus queue failed", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
