import { getUser } from "@/lib/auth";
import { MAX_WEEKS, isDay, scheduleWeeks } from "@/server/views/schedule";

/**
 * Timetable weeks as the page scrolls: GET ?from=YYYY-MM-DD&weeks=N returns N
 * weeks (at most 8) from the Monday of `from`, in the same shape the page
 * opened with. Reads Postgres only. Guests get the academic calendar without
 * classes; a student's classes, attendance and files stay theirs.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const count = Number(url.searchParams.get("weeks") ?? 1);
  if (!isDay(from) || !Number.isFinite(count) || count < 1 || count > MAX_WEEKS) return Response.json({ error: "Bad range" }, { status: 400 });
  const user = await getUser();
  const weeks = await scheduleWeeks(user?.id ?? null, from, count);
  // Per student: never shared by a cache; the page keeps what it loaded.
  return Response.json({ weeks }, { headers: { "Cache-Control": "private, no-store" } });
}
