import { runRemindersBatch } from "@/server/sync/batch";
import { runBroadcasts } from "@/server/sync/broadcasts";
import { cronAuthorized } from "../auth";

/** Due admin broadcasts, then time-based bot reminders (digest, class, QR, deadlines, exams, rating). Call every 5 minutes. */
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return new Response(null, { status: 401 });
  try {
    // Broadcasts first, on a short budget; a failure there never blocks reminders.
    const broadcasts = await runBroadcasts({ budgetMs: 20_000 }).catch((error) => {
      console.error("Broadcasts failed", error);
      return { error: "failed" };
    });
    return Response.json({ ...(await runRemindersBatch({ budgetMs: 35_000 })), broadcasts });
  } catch (error) {
    console.error("Reminders batch failed", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
