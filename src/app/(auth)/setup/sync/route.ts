import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { lmsCache } from "@/lib/db/schema";
import type { UserCache } from "@/lib/lms/cache";
import { studentSemester } from "@/lib/lms/enrollment";
import { lmsProfile } from "@/lib/lms/profile";
import { studentTimetable } from "@/lib/lms/schedule";

export const dynamic = "force-dynamic";

export type SyncStep = "profile" | "courses" | "timetable" | "grades" | "files";

/**
 * First sync (1.7): pulls the student's semester from the LMS once, streaming
 * one line per finished step ({"step":"courses","ok":true}), then saves the
 * snapshot every page reads from. Only the signed-in student's own data.
 */
export async function POST() {
  const user = await getUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (step: SyncStep, ok: boolean) => controller.enqueue(encoder.encode(`${JSON.stringify({ step, ok })}\n`));
      const track = <T,>(step: SyncStep, work: Promise<T>) =>
        work.then((value) => { send(step, value !== null); return value; }, () => { send(step, false); return null; });
      const [profile, enrollment, timetable] = await Promise.all([
        track("profile", lmsProfile(user.id, user.email)),
        track("courses", studentSemester(user.id)),
        track("timetable", studentTimetable(user.id)),
      ]);
      // Grades come with the profile's semesters.
      send("grades", !!profile);
      const data: UserCache = { enrollment, timetable: timetable ?? [], profile };
      await db().insert(lmsCache).values({ userId: user.id, data, syncedAt: new Date() })
        .onConflictDoUpdate({ target: lmsCache.userId, set: { data, syncedAt: new Date() } })
        .then(() => send("files", true), () => send("files", false));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
