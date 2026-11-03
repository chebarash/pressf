import type { RateQueueView } from "@/server/views";
import * as adapt from "./adapt";
import { RateScreen, type RateActions } from "./split/RateScreen";

/**
 * D5 Rate dialog for the first course waiting (or `courseId` from /rate/[course]).
 * `actions.submit` is the server action that stores the rating.
 */
export default function DesktopRate({ data, courseId, actions }: { data: RateQueueView; courseId?: string | null; actions?: RateActions }) {
  return <RateScreen data={adapt.rate(data, courseId)} actions={actions} />;
}
