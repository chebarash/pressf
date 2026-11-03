"use client";

import { useRouter } from "next/navigation";
import { openLink } from "@/platform/client";
import { cx, Face } from "@/ui/components";
import { Sheet } from "@/ui/shell/overlays";
import { MainButton } from "./MainButton";
import s from "./Next.module.css";
import type { NextCourse } from "../views";

const LMS_URL = "https://newuzbekistan.hero.study";

/** Figma 4.15 Pick a cohort: how the cohorts compare; the choice itself happens in LMS. */
export function CohortSheet({ course, selection }: { course: NextCourse; selection?: string | null }) {
  const router = useRouter();
  const close = () => router.replace("/next", { scroll: false });
  const best = Math.max(-1, ...course.cohorts.map((c) => c.pressFPct ?? -1));
  return (
    <Sheet label={`${course.name} cohorts`} onClose={close} className={s.sheet}>
      <h2 className={cx("sh-sheet__title", s.sheetTitle)}>{course.name} · pick a cohort</h2>
      <MainButton text="Choose in LMS" onClick={() => openLink(LMS_URL)} />
      <p className={s.hint}>You choose in LMS during cohort selection{selection ? `, ${selection}` : ""}. Here&apos;s how they compare.</p>
      {course.cohorts.length ? (
        course.cohorts.map((c, i) => (
          <div key={`${c.teacherId}${i}`} className={cx(s.cohort, best >= 0 && c.pressFPct === best && s.cohortFit)}>
            <Face src={c.face ?? null} size={40} />
            <span className={s.cohortBody}>
              <span className={s.cohortTitle}>
                Cohort {i + 1} · {c.name}
              </span>
              {c.when || c.room ? <span className={s.cohortSlots}>{[c.when, c.room].filter(Boolean).join(" · ")}</span> : null}
            </span>
            {c.pressFPct !== null ? (
              <span className={s.pct}>
                <span>{c.pressFPct}%</span>
                <span className={s.pctLabel}>pressed F</span>
              </span>
            ) : null}
          </div>
        ))
      ) : (
        <p className={s.hint}>Cohorts appear here once the registrar publishes the timetable.</p>
      )}
    </Sheet>
  );
}
