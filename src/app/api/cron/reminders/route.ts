import { runRemindersBatch } from "@/server/sync/batch";
import { cronAuthorized } from "../auth";

/** Time-based bot reminders (digest, class, QR, deadlines, exams, rating). Call every 5 minutes. */
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 });
  try {
    return Response.json(await runRemindersBatch());
  } catch (error) {
    console.error("Reminders batch failed", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
