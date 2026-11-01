"use client";

import Link from "next/link";
import { useState } from "react";
import { Arrow, Face, Icons, Score, Tag } from "./ui";

export type Tile = { code: string; subject: string; credits: number | null; type: string; files: number; needs: string[]; unlocks: string[]; score: number | null; teachers: number; faces: Array<{ name: string; src: string | null }> };
export type Term = { label: string; year: number | null; tiles: Tile[] };

const LEGEND = [["Core", "core"], ["Elective", "elective"], ["Selected", "selected"], ["Needs or unlocks", "linked"]];

export function CurriculumBoard({ terms }: { terms: Term[] }) {
  const all = terms.flatMap((t) => t.tiles);
  const [selected, setSelected] = useState<Tile | null>(all[0] ?? null);
  const linked = new Set([...(selected?.needs ?? []), ...(selected?.unlocks ?? [])]);
  const years = [...new Set(terms.map((t) => t.year))];
  const name = (code: string) => all.find((tile) => tile.code === code)?.subject ?? code;
  const chips = (label: string, codes: string[]) => codes.length > 0 && (
    <div className="row" style={{ "--gap": "8px", flexWrap: "nowrap", alignItems: "start" } as React.CSSProperties}>
      <span className="small soft" style={{ width: 56, flex: "none" }}>{label}</span>
      <span className="row" style={{ "--gap": "6px" } as React.CSSProperties}>{codes.map((code) => <Link key={code} className="chip small-chip" href={`/courses/${code}`}>{code} {name(code)}</Link>)}</span>
    </div>
  );
  const board = years.map((year, index) => {
    const body = (
      <div className="grid-2" style={{ gap: 16 }}>
        {terms.filter((t) => t.year === year).map((term) => (
          <div key={term.label} className="semester">
            <span className="label">{term.label}</span>
            <div className="tiles">
              {term.tiles.map((tile) => (
                <button key={tile.code} className={`tile ${tile.type === "elective" ? "elective" : ""} ${selected?.code === tile.code ? "on" : ""} ${linked.has(tile.code) ? "linked" : ""}`} onClick={() => setSelected(tile)}>
                  <span className="row between label-sm soft"><span>{tile.code}</span>{tile.credits != null && <span>{tile.credits} ECTS</span>}</span>
                  <span className="label">{tile.subject}</span>
                  <span className="row label-sm soft" style={{ "--gap": "8px" } as React.CSSProperties}>
                    <span className="row" style={{ "--gap": "3px" } as React.CSSProperties}>{Icons.file(13)}{tile.files}</span>
                    <span className="row" style={{ "--gap": "3px" } as React.CSSProperties}>{Icons.users(13)}{tile.teachers}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
    const title = year ? `Year ${year}` : "Other";
    if (index < 2) return <div key={year ?? "x"} className="stack"><h2 className="d-sm">{title}</h2>{body}</div>;
    const courses = terms.filter((t) => t.year === year);
    return (
      <details key={year ?? "x"} className="year">
        <summary><span className="d-xs serif grow">{title}</span><span className="small soft">{courses.length} semesters · {courses.reduce((sum, t) => sum + t.tiles.length, 0)} courses</span></summary>
        {body}
      </details>
    );
  });
  return (
    <div className="stack">
      <div className="row legend" style={{ "--gap": "16px" } as React.CSSProperties}>{LEGEND.map(([label, tone]) => <span key={tone} className="row small" style={{ "--gap": "6px" } as React.CSSProperties}><i className={`dot ${tone}`} />{label}</span>)}</div>
      <div className="cur-grid">
        <div className="stack" style={{ "--gap": "32px" } as React.CSSProperties}>{board}</div>
        {selected && (
          <aside key={selected.code} className="card slide-in cur-panel">
            <div className="row between" style={{ flexWrap: "nowrap", alignItems: "start" }}>
              <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}><div><Tag tone="accent-tag">{selected.code}</Tag></div><h2 className="d-sm">{selected.subject}</h2></div>
              {selected.score != null && <Score value={selected.score} />}
            </div>
            {chips("Needs", selected.needs)}
            {chips("Unlocks", selected.unlocks)}
            {selected.teachers > 0 && <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}><span className="faces">{selected.faces.map((face, index) => <Face key={index} name={face.name} src={face.src} size={44} />)}</span><span className="small soft">{selected.teachers} {selected.teachers === 1 ? "teacher" : "teachers"} this term</span></div>}
            {(selected.needs.length > 0 || selected.unlocks.length > 0) && <p className="small soft">Requirements come from syllabi.</p>}
            <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
              <Link className="key btn sm primary" href={`/courses/${selected.code}`}>Open course<Arrow /></Link>
              {selected.files > 0 && <Link className="key btn sm" href={`/courses/${selected.code}#files`}>{selected.files} {selected.files === 1 ? "file" : "files"}</Link>}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
