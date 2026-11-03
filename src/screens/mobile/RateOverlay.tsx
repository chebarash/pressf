import { RateSheet } from "./parts/RateSheet";
import type { RateScreen } from "./views";

/**
 * The rating sheet alone, over the page it was opened from (an intercepted
 * /rate or /rate/[courseId]). The "To rate" list stays on its own page.
 */
export default function RateOverlay({ data }: { data: RateScreen }) {
  if (!data.open) return null;
  return <RateSheet key={`${data.open.item.courseId}|${data.open.item.term}`} open={data.open} queue={data.waiting} />;
}
