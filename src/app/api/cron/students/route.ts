import { runSyncBatch } from "@/server/sync/batch";
import { cronAuthorized } from "../auth";

/**
 * Syncs a batch of students from the LMS (notifications, gradebook, homework,
 * timetable, new files) and sends their alerts. Call every few minutes; each
 * call takes the students synced longest ago. `?limit=` caps the batch.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 });
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 25));
  try {
    return Response.json(await runSyncBatch({ limit }));
  } catch (error) {
    console.error("Student sync batch failed", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
