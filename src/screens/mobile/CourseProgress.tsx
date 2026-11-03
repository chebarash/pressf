import type { Mark } from "@/core/attendance";
import type { CourseProgressView, ProgressView } from "@/server/views";
import { QrIcon } from "./mc/kit";
import { MainButton, Sheet } from "./mc/client";
import { Absences, cx } from "./mc/parts";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";
import Progress from "./Progress";

const MARK: Record<Mark, { label: string; cls: string }> = {
  present: { label: "Attended", cls: s.pillOk },
  late: { label: "Late", cls: s.pillWarn },
  absent: { label: "Absent", cls: s.pillBad },
  unmarked: { label: "Not marked", cls: s.pillMuted },
};

const n = (v: number | null) => (v === null ? "—" : String(Math.round(v)));

/**
 * Mobile Course progress (Figma 5.2): the gradebook sheet over Progress.
 * `behind` is the Progress view the sheet sits on; closing it goes back there.
 */
export default function CourseProgress({ data, behind }: { data: CourseProgressView; behind: ProgressView | null }) {
  const k = data.course;
  const numbers = [
    { label: "Average", value: n(k.average) },
    { label: "Rating", value: n(k.rating) },
    { label: "Final", value: n(k.final) },
    { label: "FX", value: k.fx ? "FX" : "—" },
    { label: "Grade", value: k.final === null ? "—" : k.passed ? "Pass" : "Fail" },
  ];
  return (
    <>
      {behind ? <Progress data={behind} /> : null}
      <Sheet closeHref="/progress" title={k.name} footer={k.code ? <MainButton inline text={`Open ${k.name}`} href={`/c/${k.code}`} /> : null}>
        <p className={cx(s.p0, s.t13, s.soft)}>{[data.term, data.teacher, "from the LMS gradebook"].filter(Boolean).join(" · ")}</p>
        <div className={c.numbers}>
          {numbers.map((x) => (
            <div key={x.label} className={c.number}>
              <p className={c.numberValue}>{x.value}</p>
              <p className={cx(s.t11m, s.soft)}>{x.label}</p>
            </div>
          ))}
        </div>
        {k.absences ? (
          <div className={c.absBlock}>
            <Absences a={k.absences} big />
          </div>
        ) : null}
        {data.events.length ? (
          <>
            <p className={s.label}>Class by class</p>
            <ul className={c.plainList}>
              {data.events.map((e, i) => (
                <li key={`${e.lesson}-${e.at ?? i}`} className={s.lineRow}>
                  <div className={cx(s.lines, s.grow)}>
                    <p className={s.t15m}>{e.lesson}</p>
                    {e.dateLabel ? <p className={cx(s.t12, s.soft)}>{e.dateLabel}</p> : null}
                  </div>
                  {e.score !== null ? <p className={s.t15sb}>{e.score}</p> : null}
                  {e.viaQr ? <QrIcon size={16} aria-label="Checked in by QR" className={s.soft} /> : null}
                  <span className={cx(s.pill, MARK[e.mark].cls)}>{MARK[e.mark].label}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={cx(s.p0, s.t13, s.soft)}>No classes marked yet.</p>
        )}
      </Sheet>
    </>
  );
}
