import Link from "next/link";
import type { FileView } from "@/server/views";
import { FILE_FLAG } from "@/ui/components";
import * as adapt from "./adapt";
import c from "./course/course.module.css";
import { CourseLayout } from "./course/CourseView";
import type { FileData } from "./model";
import { AnchorButton, css, cx, Empty, Hint, Icon, KeyTo, shareHref } from "./parts";

/** Same flag colours as File/Row v2 (Figma 4153:2357), by the shared FILE_FLAG families. */
const FAMILY_COLOR = { exam: "var(--bg-danger)", mock: "var(--mustard-500)", lecture: "var(--bg-accent)", notes: "var(--plum-500)", syllabus: "var(--moss-500)", other: "var(--border-subtle)" } as const;
const flagOf = (type: string) => FAMILY_COLOR[(FILE_FLAG as Record<string, keyof typeof FAMILY_COLOR>)[type] ?? "other"];

/** D12 File preview. D downloads, ⌘↵ opens in a new tab, Esc goes back to the course. */
export default function DesktopFile({ data }: { data: FileView }) {
  return <FileScreen data={adapt.file(data)} />;
}

export function FileScreen({ data }: { data: FileData }) {
  const back = data.courseLink;
  const preview = data.file ? (
    <FilePreview file={data.file} back={back} crumb={!data.course} />
  ) : (
    <aside className={c.file}>
      <Empty title="Sign in to open files">LMS files and course details are only for signed-in students.</Empty>
    </aside>
  );
  if (data.course) return <CourseLayout data={data.course} aside={preview} />;
  return <div data-desktop-screen className={cx(css.screen, c.single)}>{preview}</div>;
}

function FilePreview({ file, back, crumb }: { file: NonNullable<FileData["file"]>; back: FileData["courseLink"]; crumb: boolean }) {
  return (
    <aside className={c.file} aria-label="File preview">
      {/* With the course open next to it (Figma D12) the head is first; Esc goes back. */}
      {back && crumb && (
        <Link href={back.href} className={c.back}>
          <Icon name="chevron-left" size={16} />
          {back.name}
        </Link>
      )}
      <div className={c.fileHead}>
        <span className={c.fileFlag} style={{ background: flagOf(file.type) }} />
        <span className={c.boxText}>
          <span className={c.fileTitle}>{file.title}</span>
          <span className={c.fileMeta}>{file.meta}</span>
        </span>
        {back && (
          <KeyTo k="Escape">
            <Link href={back.href} aria-label={`Back to ${back.name}`}>
              <Hint>Esc</Hint>
            </Link>
          </KeyTo>
        )}
      </div>
      {file.previewUrl ? (
        <iframe className={c.frame} src={file.previewUrl} title={file.title} loading="lazy" />
      ) : (
        <div className={c.page}>
          <p className={c.pageTitle}>{file.title}</p>
          <p className={c.pageNote}>No preview for this file type. Download it or open it in a new tab.</p>
        </div>
      )}
      <div className={c.fileActions}>
        <AnchorButton href={file.downloadHref} download data-key="d">
          Download
        </AnchorButton>
        <Hint>D</Hint>
        <AnchorButton href={file.openHref} variant="secondary" target="_blank" rel="noopener" data-key="mod+Enter">
          Open in new tab
        </AnchorButton>
        <Hint>⌘↵</Hint>
        <AnchorButton href={shareHref(`/f/${encodeURIComponent(file.id)}`, file.title)} variant="secondary" target="_blank" rel="noopener">
          Share
        </AnchorButton>
      </div>
    </aside>
  );
}
