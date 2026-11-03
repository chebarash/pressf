import { runSyncBatch } from "@/server/sync/batch";
import { withJobLock } from "@/server/scheduler";
import { cronAuthorized } from "../auth";

/**
 * Syncs a batch of students from the LMS (notifications, gradebook, homework,
 * timetable, new files) and sends their alerts. The server runs this every five
 * minutes by itself (src/server/scheduler.ts); this route is for manual runs and
 * shares its lock. `?limit=` caps the batch.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 });
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 25));
  try {
    const out = await withJobLock("students", () => runSyncBatch({ limit, budgetMs: 50_000 }));
    return Response.json(out.locked ? { locked: true } : out.result);
  } catch (error) {
    console.error("Student sync batch failed", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
