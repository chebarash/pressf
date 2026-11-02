import Link from "next/link";
import type { FileView } from "@/server/views";
import * as adapt from "./adapt";
import c from "./course/course.module.css";
import { CourseLayout } from "./course/CourseView";
import type { FileData } from "./model";
import { AnchorButton, css, cx, Empty, Hint, Icon, KeyTo } from "./parts";

const FLAG: Record<string, string> = { lecture: "var(--bg-accent)", practice: "var(--school-humanities)", lab: "var(--school-humanities)", exam: "var(--rating-mid)", mock: "var(--rating-mid)", assignment: "var(--bg-danger)", notes: "var(--school-medicine)" };

/** D12 File preview. D downloads, ⌘↵ opens in a new tab, Esc goes back to the course. */
export default function DesktopFile({ data }: { data: FileView }) {
  return <FileScreen data={adapt.file(data)} />;
}

export function FileScreen({ data }: { data: FileData }) {
  const back = data.courseLink;
  const preview = data.file ? (
    <FilePreview file={data.file} back={back} />
  ) : (
    <aside className={c.file}>
      <Empty title="Sign in to open files">LMS files and course details are only for signed-in students.</Empty>
    </aside>
  );
  if (data.course) return <CourseLayout data={data.course} aside={preview} />;
  return <div className={cx(css.screen, c.single)}>{preview}</div>;
}

function FilePreview({ file, back }: { file: NonNullable<FileData["file"]>; back: FileData["courseLink"] }) {
  return (
    <aside className={c.file} aria-label="File preview">
      {back && (
        <Link href={back.href} className={c.back}>
          <Icon name="chevron-left" size={16} />
          {back.name}
        </Link>
      )}
      <div className={c.fileHead}>
        <span className={c.fileFlag} style={{ background: FLAG[file.type] ?? "var(--border-strong)" }} />
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
          <Icon name="download" size={20} />
        </AnchorButton>
        <Hint>D</Hint>
        <AnchorButton href={file.openHref} variant="secondary" target="_blank" rel="noopener" data-key="mod+Enter">
          Open in new tab
        </AnchorButton>
        <Hint>⌘↵</Hint>
      </div>
    </aside>
  );
}
