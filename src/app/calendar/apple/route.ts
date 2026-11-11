import { SITE_URL } from "@/core/links";
import { appleRedirect } from "@/server/calendar-feed";

/**
 * "Apple Calendar" from inside Telegram: its in-app browser opens only
 * http(s) links, so the Mini App opens this page in Safari, which hands the
 * webcal:// link to the Calendar app (its subscribe dialog). `?feed=<token>`
 * for a student's own feed, nothing for the public academic calendar. Only
 * ever redirects to this site's own feeds.
 */
export function GET(request: Request) {
  const to = appleRedirect(new URL(request.url).searchParams.get("feed"), SITE_URL);
  if (!to) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } });
}
