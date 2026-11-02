import Link from "next/link";
import type { CourseProgressView } from "@/server/views";
import * as adapt from "./adapt";
import type { CourseProgressData } from "./model";
import { css, cx, Icon } from "./parts";
import { ProgressTable } from "./Progress";
import g from "./progress.module.css";

/** D6 opened on one course: its row with marks and every class (QR / absent). */
export default function DesktopCourseProgress({ data }: { data: CourseProgressView }) {
  return <CourseProgressScreen data={adapt.courseProgress(data)} />;
}

export function CourseProgressScreen({ data }: { data: CourseProgressData }) {
  return (
    <main className={cx(css.screen, g.main)}>
      <Link href="/progress" className={g.back} data-key="Escape">
        <Icon name="chevron-left" size={14} /> Progress
      </Link>
      <h1 className={g.title}>{data.course.name}</h1>
      <p className={g.sub}>{[data.course.code, data.course.term, data.course.teacher].filter(Boolean).join(" · ")}</p>
      <ProgressTable rows={[{ ...data.row, href: data.course.href }]} open={data.row.id} />
    </main>
  );
}
