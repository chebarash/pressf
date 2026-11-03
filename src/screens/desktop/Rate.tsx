import type { RateQueueView } from "@/server/views";
import * as adapt from "./adapt";
import { RateScreen, type RateActions } from "./split/RateScreen";

/**
 * D5 Rate dialog for the first course waiting (or `courseId` from /rate/[course]).
 * `actions.submit` is the server action that stores the rating.
 */
export default function DesktopRate({ data, courseId, actions }: { data: RateQueueView; courseId?: string | null; actions?: RateActions }) {
  const view = adapt.rate(data, courseId);
  // A fresh form per course: "Next course" lands on a new, empty dialog.
  return <RateScreen key={view.course?.id ?? "none"} data={view} actions={actions} />;
}
