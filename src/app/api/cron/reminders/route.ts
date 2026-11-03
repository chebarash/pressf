import { JOBS, withJobLock } from "@/server/scheduler";
import { cronAuthorized } from "../auth";

/**
 * Due admin broadcasts, then time-based bot reminders (digest, class, QR,
 * deadlines, exams, rating). The server runs this every minute by itself
 * (src/server/scheduler.ts); this route is for manual runs and shares its lock.
 */
export const maxDuration = 60;

const job = JOBS.find((j) => j.name === "reminders")!;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 });
  try {
    const out = await withJobLock(job.name, job.run);
    return Response.json(out.locked ? { locked: true } : out.result);
  } catch (error) {
    console.error("Reminders batch failed", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
