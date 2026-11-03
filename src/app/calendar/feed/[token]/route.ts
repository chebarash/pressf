import { personalFeed } from "@/server/calendar-feed";

/**
 * A student's personal calendar feed (/calendar/feed/<token>.ics), polled by
 * Google Calendar and other apps. The token is the only credential: unknown or
 * reset tokens get a plain 404. Built from Postgres only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ics = token.endsWith(".ics") ? await personalFeed(token.slice(0, -4)) : null;
  if (!ics) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="press-f.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
