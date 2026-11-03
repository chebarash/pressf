import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import DesktopCalendar from "@/screens/desktop/Calendar";
import Calendar from "@/screens/mobile/Calendar";
import { DEFAULT_LAYERS, parseLayers } from "@/screens/mobile/mc/format";
import { mobile, one, type SearchParams } from "@/screens/mobile/mc/route";
import { calendarFeed, personalSubscription } from "@/server/calendar-feed";
import { calendar } from "@/server/views";
import { RememberLayers } from "./RememberLayers";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const [sp, user, isMobile] = await Promise.all([searchParams, getUser(), mobile()]);
  // The student's own feed (made on first visit) and the layers they last picked.
  const feed = user ? await calendarFeed(user.id) : null;
  const asked = one(sp.layers);
  const layers = asked === null || asked === undefined ? (feed?.layers ?? DEFAULT_LAYERS) : parseLayers(asked);
  // An empty selection still means "none on" (6.2), not "all".
  const data = await calendar(user ? { userId: user.id } : null, layers.length ? layers : ["classes"]);
  const shown = layers.length ? data : { ...data, days: [], layers: data.layers.map((l) => ({ ...l, on: false })), empty: { text: "Nothing coming up in these layers." } };
  const view = feed ? { ...shown, subscribe: personalSubscription(feed.token) } : shown;
  const changed = feed && (feed.layers ?? DEFAULT_LAYERS).join(",") !== layers.join(",");
  return (
    <>
      {isMobile ? <Calendar data={view} /> : <DesktopCalendar data={view} />}
      {changed ? <RememberLayers layers={layers} /> : null}
    </>
  );
}
