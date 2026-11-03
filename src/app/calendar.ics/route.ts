import { calendarIcs } from "@/lib/calendar";

export function GET() {
  return new Response(calendarIcs(), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="newuu-academic-calendar.ics"', "Cache-Control": "public, max-age=3600" },
  });
}
