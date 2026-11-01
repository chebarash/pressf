import { ViewTransition } from "react";
import Link from "next/link";
import type { Certainty } from "@/lib/mention-match";
import { Arrow, Face, Score, Tag, tags, viewName } from "./ui";

export function CourseCard({ code, name, score, meta }: { code: string; name: string; score?: number | null; meta: string }) {
  return (
    <Link className="card course-card" href={`/courses/${code}`}>
      <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <div><Tag tone="accent-tag">{code}</Tag></div>
        <ViewTransition name={`course-${viewName(code)}`}><h3 className="d-xs">{name}</h3></ViewTransition>
      </div>
      <div className="row between course-meta"><span className="small soft grow">{meta}</span><Score value={score} /></div>
    </Link>
  );
}

export function TeacherRow({ id, name, meta, face, score }: { id: string; name: string; meta: string; face?: string | null; score?: number | null }) {
  return (
    <Link className="line-row link" href={`/professors/${id}`}>
      <Score value={score} />
      <ViewTransition name={`face-${id}`}><Face name={name} src={face} /></ViewTransition>
      <div className="grow"><ViewTransition name={`name-${id}`}><div className="d-xs teacher-name">{name}</div></ViewTransition><div className="small soft">{meta}</div></div>
    </Link>
  );
}

export type FileItem = { id: string; fileName: string; type: string | null; term: string | null; courseName: string | null; author: string | null; hasSolutions: boolean };

const fileTitle = (name: string) => name.replace(/(\.(pdf|docx|pptx))+$/i, "").replace(/_+/g, " ").replace(/\bNUU\b/g, "NewUU").trim();

export function FileRow({ file }: { file: FileItem }) {
  const meta = [file.courseName, file.term, file.author && `by ${file.author}`].filter(Boolean).join(" · ");
  return (
    <div className="file">
      <div className="grow">
        <div className="row" style={{ "--gap": "6px" } as React.CSSProperties}>
          {file.type && <Tag tone={tags[file.type]}>{file.type}</Tag>}
          {file.hasSolutions && <Tag>Solutions</Tag>}
        </div>
        <div className="name">{fileTitle(file.fileName)}</div>
        <div className="small soft">{meta}</div>
      </div>
      <a className="key btn sm" href={`/files/${file.id}`} target="_blank" rel="noreferrer">Open</a>
    </div>
  );
}

export type MentionItem = { postId: number; url: string; text: string; date: Date | null; certainty?: Certainty };

/** The bot's links can be wrong, so `full` keeps the whole post readable where people judge it. */
export function MentionCard({ mention, full }: { mention: MentionItem; full?: boolean }) {
  return (
    <a className="card" href={mention.url} target="_blank" rel="noreferrer">
      <div className="row between">
        <span className="label-sm accent">Anonymous</span>
        <span className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
          {mention.certainty === "possible" && <Tag>Possible match</Tag>}
          {mention.date && <span className="small soft">{mention.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
        </span>
      </div>
      <p className={full ? "post-full" : "post-short"}>{mention.text}</p>
      <span className="label-sm accent row" style={{ "--gap": "6px" } as React.CSSProperties}>Open post<Arrow /></span>
    </a>
  );
}
