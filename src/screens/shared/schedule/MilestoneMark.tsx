import type { ScheduleClass } from "@/server/views";
import { classMark } from "./lesson";
import m from "./marker.module.css";

/**
 * The syllabus milestone on a class block ("Quiz 2"); dashed when the day is
 * inferred. `compact` (Month's narrow chips): the kind only ("Quiz"), the same
 * pill. Nothing without a milestone.
 */
export function MilestoneMark({ c, inline = false, compact = false }: { c: Pick<ScheduleClass, "milestones">; inline?: boolean; compact?: boolean }) {
  const mark = classMark(c, compact);
  if (!mark) return null;
  return (
    <span className={[m.mark, mark.likely && m.likely, inline && m.inline].filter(Boolean).join(" ")} title={mark.title} data-milestone={mark.likely ? "likely" : "stated"}>
      {mark.text}
    </span>
  );
}
