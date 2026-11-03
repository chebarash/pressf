import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import DesktopCalendar from "@/screens/desktop/Calendar";
import Calendar from "@/screens/mobile/Calendar";
import { parseLayers } from "@/screens/mobile/mc/format";
import { mobile, one, type SearchParams } from "@/screens/mobile/mc/route";
import { calendar } from "@/server/views";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const [sp, user, isMobile] = await Promise.all([searchParams, getUser(), mobile()]);
  const layers = parseLayers(one(sp.layers));
  // An empty selection still means "none on" (6.2), not "all".
  const data = await calendar(user ? { userId: user.id } : null, layers.length ? layers : ["classes"]);
  const view = layers.length ? data : { ...data, days: [], layers: data.layers.map((l) => ({ ...l, on: false })), empty: { text: "Nothing coming up in these layers." } };
  return isMobile ? <Calendar data={view} /> : <DesktopCalendar data={view} />;
}
