import { ViewTransition } from "react";
import Link from "next/link";
import type { Certainty } from "@/lib/mention-match";
import { Arrow, Face, Icons, Score, Tag, tags, viewName } from "./ui";

export type CardFace = { name: string; src?: string | null };

export function CourseCard({ code, name, score, meta, faces = [] }: { code: string; name: string; score?: number | null; meta: string; faces?: CardFace[] }) {
  return (
    <Link className="card course-card" href={`/courses/${code}`}>
      <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <div><Tag tone="accent-tag">{code}</Tag></div>
        <ViewTransition name={`course-${viewName(code)}`}><h3 className="d-sm">{name}</h3></ViewTransition>
      </div>
      <div className="row course-meta" style={{ flexWrap: "nowrap" }}>
        {faces.length > 0 && <span className="faces">{faces.map((face, index) => <Face key={index} name={face.name} src={face.src} size={44} />)}</span>}
        <span className="small soft grow">{meta}</span>
        <Score value={score} />
      </div>
    </Link>
  );
}

export function TeacherRow({ id, name, meta, face, score, courses = [] }: { id: string; name: string; meta: string; face?: string | null; score?: number | null; courses?: string[] }) {
  return (
    <Link className="line-row link teacher-row" href={`/professors/${id}`}>
      <Score value={score} size="md" />
      <ViewTransition name={`face-${id}`}><Face name={name} src={face} size={80} /></ViewTransition>
      <div className="grow"><ViewTransition name={`name-${id}`}><div className="d-xs serif teacher-name">{name}</div></ViewTransition><div className="small soft">{meta}</div></div>
      {courses.length > 0 && <span className="row hide-sm" style={{ "--gap": "8px", justifyContent: "end" } as React.CSSProperties}>{courses.map((course) => <span key={course} className="chip small-chip">{course}</span>)}</span>}
    </Link>
  );
}

export function ProfessorCard({ id, name, meta, face, score }: { id: string; name: string; meta: string; face?: string | null; score?: number | null }) {
  return (
    <Link className="card professor-card" href={`/professors/${id}`}>
      <Face name={name} src={face} size={120} />
      <div className="d-xs serif teacher-name">{name}</div>
      <div className="row" style={{ "--gap": "12px", flexWrap: "nowrap" } as React.CSSProperties}><Score value={score} /><span className="small soft">{meta}</span></div>
    </Link>
  );
}

export function TeacherCard({ id, name, face, score, groups, time, room, office, styles }: { id: string; name: string; face?: string | null; score?: number | null; groups: string[]; time?: string; room?: string | null; office?: string; styles: string[] }) {
  return (
    <Link className="card teacher-card" href={`/professors/${id}`}>
      <Face name={name} src={face} size={96} />
      <div className="stack grow" style={{ "--gap": "12px" } as React.CSSProperties}>
        <div className="row between" style={{ flexWrap: "nowrap" }}><div className="d-xs serif teacher-name">{name}</div><Score value={score} /></div>
        {groups.length > 0 && <div className="small soft">Teaches {groups.join(", ")}</div>}
        {office && <div className="small soft">{office}</div>}
        {time && <div className="row small soft" style={{ "--gap": "6px" } as React.CSSProperties}>{Icons.clock()}<span>{time}</span>{room && <>{Icons.pin()}<span>{room}</span></>}</div>}
        {styles.length > 0 && <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>{styles.map((style) => <Tag key={style}>{style}</Tag>)}</div>}
      </div>
    </Link>
  );
}

export type FileItem = { id: string; fileName: string; type: string | null; term: string | null; courseName: string | null; author: string | null; hasSolutions: boolean };

const fileTitle = (name: string) => name.replace(/(\.(pdf|docx|pptx))+$/i, "").replace(/_+/g, " ").replace(/\bNUU\b/g, "NewUU").trim();

export function FileRow({ file }: { file: FileItem }) {
  const meta = [file.term, file.courseName, file.author && `by ${file.author}`].filter(Boolean).join(" · ");
  return (
    <div className="file">
      {file.type && <Tag tone={tags[file.type]}>{file.type}</Tag>}
      <div className="grow">
        <div className="name">{fileTitle(file.fileName)}</div>
        <div className="small soft">{meta}</div>
      </div>
      {file.hasSolutions && <span className="hide-sm"><Tag tone="warm">Solutions</Tag></span>}
      <a className="key btn sm" href={`/files/${file.id}`} target="_blank" rel="noreferrer">Open</a>
    </div>
  );
}

export type MentionItem = { postId: number; url: string; text: string; date: Date | null; certainty?: Certainty };

/** The bot's links can be wrong, so `full` keeps the whole post readable where people judge it. */
/** The bot's links can be wrong, so `full` keeps the whole post readable where people judge it. */
export function MentionCard({ mention, full, matched }: { mention: MentionItem; full?: boolean; matched?: string }) {
  return (
    <a className="card mention-card" href={mention.url} target="_blank" rel="noreferrer">
      <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
        <span className="accent row" style={{ "--gap": "6px" } as React.CSSProperties}>{Icons.send()}<span className="label-sm">Anonymous</span></span>
        {mention.date && <span className="small soft">{mention.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
      </div>
      <p className={full ? "post-full" : "post-short"}>{mention.text}</p>
      <div className="row between" style={{ "--gap": "8px" } as React.CSSProperties}>
        {mention.certainty === "possible" ? <Tag>Possible match</Tag> : matched ? <Tag>{matched}</Tag> : <span />}
        <span className="label-sm accent row" style={{ "--gap": "6px" } as React.CSSProperties}>Open post{Icons.external(14)}</span>
      </div>
    </a>
  );
}
