import { cx, FILE_FLAG } from "@/ui/components";
import fr from "@/ui/components/FileRow.module.css";
import b from "./parts/base.module.css";
import { FileActions, ShareButton } from "./parts/FileActions";
import s from "./parts/File.module.css";
import { MainButton } from "./parts/MainButton";
import { PdfPages } from "./parts/PdfPages";
import type { FileView } from "./views";

const size = (n: number | null) => (n === null ? null : n < 1_000_000 ? `${Math.max(1, Math.round(n / 1000))} KB` : `${(n / 1_000_000).toFixed(1)} MB`);

/** Mobile file preview (Figma 4.9). Download goes through /f/[id]/download: the branded copy, else the original. */
export default function File({ data }: { data: FileView }) {
  if (data.locked) {
    return (
      <div className={b.screen}>
        <div className={b.empty}>
          <h1 className={b.emptyTitle}>Sign in to open this file</h1>
          <p className={b.emptyText}>Course files are for students{data.course ? ` of ${data.course.name}` : ""}. Sign in with your LMS account.</p>
        </div>
        <MainButton text="Sign in with LMS" href={`/sign-in?next=${encodeURIComponent(`/f/${data.id}`)}`} />
      </div>
    );
  }
  // Figma 4.9: "Calculus 1 · Week 8 · 2 Nov · LMS · 24 pages" (size when the page count is unknown).
  const meta = [data.course.name, data.week ? `Week ${data.week}` : null, data.dateLabel, data.from, data.pages ? `${data.pages} ${data.pages === 1 ? "page" : "pages"}` : size(data.size)].filter(Boolean).join(" · ");
  return (
    <div className={cx(b.screen, s.screen)}>
      <header className={s.head}>
        <span className={cx(fr.flag, fr[FILE_FLAG[data.type]], s.flag)} aria-hidden />
        <div className={s.headText}>
          <h1 className={s.title}>{data.title}</h1>
          <p className={s.meta}>{meta}</p>
        </div>
        <ShareButton target={{ to: "file", id: data.id }} title={data.title} text={`${data.title} — ${data.course.name}`} />
      </header>
      {data.url && data.format === "pdf" ? (
        <PdfPages
          src={data.url.replace("/download", "/raw")}
          openUrl={data.url}
          title={data.title}
          pages={data.pages ?? null}
          fallback={<NoPreview code={data.formatCode} title="No preview here" text="Download it to open it on your phone." />}
        />
      ) : data.url ? (
        <NoPreview code={data.formatCode} title="No preview for this format" text="Download it to open it on your phone." />
      ) : (
        <NoPreview code={data.formatCode} title="This file isn't ready yet" text="We're still copying it from LMS. Try again in a few minutes." />
      )}
      {data.url ? <FileActions url={data.downloadUrl ?? `/f/${data.id}/download`} name={data.downloadName} /> : null}
    </div>
  );
}

function NoPreview({ code, title, text }: { code: string; title: string; text: string }) {
  return (
    <div className={s.noPreview}>
      <span className={s.format}>{code}</span>
      <p className={s.noPreviewTitle}>{title}</p>
      <p className={b.sub}>{text}</p>
    </div>
  );
}
