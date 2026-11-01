import Link from "next/link";
import { Arrow, Face, Score, Tag, tags } from "./ui";

export function CourseCard({ code, name, score, meta }: { code: string; name: string; score?: number | null; meta: string }) {
  return (
    <Link className="card course-card" href={`/courses/${code}`}>
      <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <div><Tag tone="accent-tag">{code}</Tag></div>
        <h3 className="d-xs">{name}</h3>
      </div>
      <div className="row between course-meta"><span className="small soft grow">{meta}</span><Score value={score} /></div>
    </Link>
  );
}

export function TeacherRow({ id, name, meta, face, score }: { id: string; name: string; meta: string; face?: string | null; score?: number | null }) {
  return (
    <Link className="line-row link" href={`/professors/${id}`}>
      <Score value={score} />
      <Face name={name} src={face} />
      <div className="grow"><div className="d-xs teacher-name">{name}</div><div className="small soft">{meta}</div></div>
    </Link>
  );
}

export type FileItem = { id: string; fileName: string; type: string | null; term: string | null; courseName: string | null; author: string | null; hasSolutions: boolean };

const fileTitle = (name: string) => name.replace(/(\.(pdf|docx|pptx))+$/i, "").replace(/_+/g, " ").trim();

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

export type MentionItem = { postId: number; url: string; text: string; date: Date };

export function MentionCard({ mention }: { mention: MentionItem }) {
  return (
    <a className="card" href={mention.url} target="_blank" rel="noreferrer">
      <div className="row between"><span className="label-sm accent">Anonymous</span><span className="small soft">{mention.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></div>
      <p style={{ display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{mention.text}</p>
      <span className="label-sm accent row" style={{ "--gap": "6px" } as React.CSSProperties}>Open post<Arrow /></span>
    </a>
  );
}
