import Link from "next/link";
import c from "./course/course.module.css";
import { CourseLayout } from "./course/CourseView";
import type { FileData } from "./fixtures/types";
import { ButtonLink, css, cx, Hint, Icon } from "./parts";

const FLAG: Record<string, string> = { lecture: "var(--bg-accent)", practice: "var(--school-humanities)", lab: "var(--school-humanities)", exam: "var(--rating-mid)", mock: "var(--rating-mid)", assignment: "var(--bg-danger)", notes: "var(--school-medicine)" };

/** D12 File preview — the course stays open; the file takes the inspector. D downloads, ⌘↵ opens in a new tab, Esc goes back to the course. */
export default function DesktopFile({ data }: { data: FileData }) {
  const preview = <FilePreview file={data.file} backHref={data.course ? `/c/${data.course.code}` : null} />;
  if (data.course) return <CourseLayout data={data.course} aside={preview} />;
  return <div className={cx(css.screen, c.layout, c.layoutNoList)} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>{preview}</div>;
}

function FilePreview({ file, backHref }: { file: FileData["file"]; backHref: string | null }) {
  return (
    <aside className={c.file} aria-label="File preview">
      <div className={c.fileHead}>
        <span className={c.fileFlag} style={{ background: FLAG[file.type] ?? "var(--border-strong)" }} />
        <span className={c.boxText}>
          <span className={c.fileTitle}>{file.title}</span>
          <span className={c.fileMeta}>{file.meta}</span>
        </span>
        {backHref && (
          <Link href={backHref} data-key="Escape" aria-label="Back to the course">
            <Hint>Esc</Hint>
          </Link>
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
        <ButtonLink href={file.downloadHref} prefetch={false} data-key="d" download>
          Download
          <Icon name="download" size={20} />
        </ButtonLink>
        <Hint>D</Hint>
        <ButtonLink href={file.openHref} prefetch={false} variant="secondary" target="_blank" rel="noopener" data-key="mod+Enter">
          Open in new tab
        </ButtonLink>
        <Hint>⌘↵</Hint>
      </div>
    </aside>
  );
}
