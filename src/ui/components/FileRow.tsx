import Link from "next/link";
import type { FileType } from "@/core/files";
import { FILE_FLAG } from "./file-flag";
import { BookIcon, ChevronRightIcon, SendIcon, UsersIcon } from "../icons";
import { cx } from "./cx";
import s from "./FileRow.module.css";

export { FILE_FLAG };

export type FileRowProps = {
  title: string;
  type: FileType;
  /** Hidden on the course page (Figma showCourse). */
  course?: string;
  /** "Week 7" (Figma showWeek). */
  week?: string;
  /** "Fall 2023" or "2 Nov". */
  date?: string;
  /** Where it came from: LMS (book icon) or the students' channel (send icon). */
  source?: { label: string; kind: "lms" | "channel" | "student" };
  href?: string;
  className?: string;
};

/** Course material row (Figma File/Row v2 4153:2357). */
export function FileRow({ title, type, course, week, date, source, href, className }: FileRowProps) {
  const body = (
    <>
      <span className={cx(s.flag, s[FILE_FLAG[type]])} aria-hidden />
      <span className={s.body}>
        <span className={s.title}>{title}</span>
        <span className={s.meta}>
          {course ? <span>{course}</span> : null}
          {week ? <span>{week}</span> : null}
          {date ? <span>{date}</span> : null}
          {source ? (
            <span className={s.source}>
              {source.kind === "lms" ? <BookIcon size={14} /> : source.kind === "student" ? <UsersIcon size={14} /> : <SendIcon size={14} />}
              <span>{source.label}</span>
            </span>
          ) : null}
        </span>
      </span>
      <ChevronRightIcon size={20} className={s.chev} />
    </>
  );
  return href ? (
    <Link href={href} className={cx(s.row, className)}>
      {body}
    </Link>
  ) : (
    <div className={cx(s.row, className)}>{body}</div>
  );
}
