"use client";

import { useState } from "react";
import type { FileType } from "@/core/files";
import type { FileRowData } from "../model";
import { css, cx, FileRow } from "../parts";
import c from "./course.module.css";

const FILTERS: Array<{ label: string; types: FileType[] }> = [
  { label: "Lectures", types: ["lecture", "lab", "practice"] },
  { label: "Exams", types: ["exam", "mock"] },
  { label: "Notes", types: ["notes", "assignment"] },
  { label: "Syllabus", types: ["syllabus", "book"] },
  { label: "Other", types: ["other"] },
];

/** Files tab (4.7 on desktop): type chips, then every file by week, newest week first; files without a week last. */
export function CourseFiles({ files, topics }: { files: Array<FileRowData & { week: number | null }>; topics: Record<number, string> }) {
  const [filter, setFilter] = useState<string | null>(null);
  const counts = FILTERS.map((f) => ({ ...f, n: files.filter((x) => f.types.includes(x.type)).length })).filter((f) => f.n > 0);
  const active = counts.find((f) => f.label === filter);
  const list = active ? files.filter((x) => active.types.includes(x.type)) : files;
  const groups = new Map<number | null, typeof list>();
  for (const f of list) groups.set(f.week, [...(groups.get(f.week) ?? []), f]);
  const ordered = [...groups.entries()].sort(([a], [b]) => (b ?? -1) - (a ?? -1));
  return (
    <section className={c.section}>
      <div className={css.chips} role="group" aria-label="File type">
        <button type="button" className={cx(css.chip, !active && css.chipOn)} aria-pressed={!active} onClick={() => setFilter(null)}>
          All {files.length}
        </button>
        {counts.map((f) => (
          <button key={f.label} type="button" className={cx(css.chip, active?.label === f.label && css.chipOn)} aria-pressed={active?.label === f.label} onClick={() => setFilter(f.label)}>
            {f.label} {f.n}
          </button>
        ))}
      </div>
      {ordered.map(([week, items]) => (
        <div key={week ?? "other"} className={c.fileGroup}>
          <h3 className={c.groupTitle}>{week === null ? "Other files" : `Week ${week}${topics[week] ? ` · ${topics[week]}` : ""}`}</h3>
          <div className={cx(c.groupFiles, css.navList)} data-nav-list>
            {items.map((f) => (
              <FileRow key={f.id} file={f} hideCourse />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
