"use client";

import Link from "next/link";
import { useState } from "react";

export type Tile = { code: string; subject: string; credits: number | null; type: string; files: number; needs: string[]; unlocks: string[] };
export type Term = { label: string; year: number | null; tiles: Tile[] };

export function CurriculumBoard({ terms }: { terms: Term[] }) {
  const all = terms.flatMap((t) => t.tiles);
  const [selected, setSelected] = useState<Tile | null>(all[0] ?? null);
  const linked = new Set([...(selected?.needs ?? []), ...(selected?.unlocks ?? [])]);
  const years = [...new Set(terms.map((t) => t.year))];
  return (
    <div style={{ display: "grid", gap: 24, gridTemplateColumns: "minmax(0, 1fr)", alignItems: "start" }} className="cur-grid">
      <div className="stack" style={{ "--gap": "48px" } as React.CSSProperties}>
        {years.map((year) => (
          <div key={year ?? "x"} className="stack">
            <h2 className="d-sm">{year ? `Year ${year}` : "Other"}</h2>
            <div className="grid-2" style={{ gap: 16 }}>
              {terms.filter((t) => t.year === year).map((term) => (
                <div key={term.label} className="semester">
                  <span className="label">{term.label}</span>
                  <div className="tiles">
                    {term.tiles.map((tile) => (
                      <button key={tile.code} className={`tile ${tile.type === "elective" ? "elective" : ""} ${selected?.code === tile.code ? "on" : ""} ${linked.has(tile.code) ? "linked" : ""}`} onClick={() => setSelected(tile)}>
                        <span className="row between label-sm soft"><span>{tile.code}</span>{tile.credits != null && <span>{tile.credits} ECTS</span>}</span>
                        <span className="label">{tile.subject}</span>
                        {tile.files > 0 && <span className="label-sm soft">{tile.files} files</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {selected && (
        <aside className="card" style={{ position: "sticky", top: 88, alignContent: "start" }}>
          <div><span className="tag accent-tag">{selected.code}</span><h2 className="d-sm">{selected.subject}</h2></div>
          {selected.needs.length > 0 && <p className="small"><span className="soft">Needs:</span> {selected.needs.join(", ")}</p>}
          {selected.unlocks.length > 0 && <p className="small"><span className="soft">Unlocks:</span> {selected.unlocks.join(", ")}</p>}
          {(selected.needs.length > 0 || selected.unlocks.length > 0) && <p className="small soft">Requirements come from syllabi.</p>}
          <Link className="key btn primary" href={`/courses/${selected.code}`}>Open course</Link>
        </aside>
      )}
    </div>
  );
}
