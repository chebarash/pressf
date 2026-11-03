"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { byWeek } from "@/core/files";
import { openTelegramLink } from "@/platform/client";
import { Chip, Collapse, cx, Tag } from "@/ui/components";
import { Sheet } from "@/ui/shell/overlays";
import { CalendarIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon } from "@/ui/icons";
import b from "./base.module.css";
import s from "./Course.module.css";
import { FileItemRow } from "./FileItemRow";
import type { FileItem, WeekView } from "../views";

export type TermLink = { term: string; note: string | null; teachers: string; href: string; selected: boolean };

/** "Fall 2026 · Now" pill that opens the semester sheet (4.3); the semester drives the whole page. */
export function SemesterSwitch({ label, terms }: { label: string; terms: TermLink[] }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={s.switch} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <CalendarIcon size={16} />
        {label}
        <ChevronDownIcon size={16} />
      </button>
      {/* The sheet goes to <body>: inside the header it would sit under the page's own layers. */}
      {open ? createPortal(
      <Sheet label="Semester" onClose={close} className={s.termSheet}>
        <h2 className="sh-sheet__title">Semester</h2>
        {terms.map((t) => (
          <Link key={t.term} href={t.href} className={cx(s.term, t.selected && s.termOn)} onClick={() => setOpen(false)} replace prefetch scroll={false} aria-current={t.selected ? "true" : undefined}>
            <span className={b.rowBody}>
              <span className={s.termName}>
                {t.term}
                {t.note ? <span className={s.termNote}>{t.note}</span> : null}
              </span>
              {t.teachers ? <span className={s.termTeachers}>{t.teachers}</span> : null}
            </span>
            {t.selected ? <CheckIcon size={20} /> : null}
          </Link>
        ))}
      </Sheet>, document.body
      ) : null}
    </>
  );
}

type Week = WeekView & { week: number };

/** Week rows around now; the current week starts open with its files (4.2). "All N weeks" shows the rest. */
export function WeekList({ weeks: all, filesHref, filesTotal, extra, teachingWeek }: { weeks: WeekView[]; filesHref: string; filesTotal: number; extra?: ReactNode; teachingWeek?: number | null }) {
  const weeks = all.filter((w): w is Week => w.week !== null);
  const now = weeks.findIndex((w) => w.current);
  // Another semester (4.4) opens at the same point of the teaching calendar, that week's files shown.
  const same = now === -1 && teachingWeek ? weeks.findIndex((w) => w.week === teachingWeek) : -1;
  const pivot = now !== -1 ? now : same !== -1 ? same : Math.max(0, weeks.findIndex((w) => w.files.length));
  const [everything, setEverything] = useState(false);
  const [open, setOpen] = useState<Set<number>>(() => new Set(now !== -1 ? [weeks[now].week] : same !== -1 && weeks[same].files.length ? [weeks[same].week] : []));
  const shown = everything ? weeks : weeks.slice(Math.max(0, pivot - 1), pivot + 2);
  const toggle = (w: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  return (
    <>
      {shown.map((w) => {
        const isOpen = open.has(w.week);
        return (
          <div key={w.week} className={s.week}>
            <button type="button" className={cx(s.weekRow, w.current && s.weekNow, now !== -1 && w.week < weeks[now].week && s.weekPast, isOpen && s.weekOpen)} onClick={() => toggle(w.week)} aria-expanded={isOpen}>
              <span className={s.weekNum}>{w.week}</span>
              <span className={s.weekTopic}>{w.topic ?? (w.files.length ? `${w.files.length} ${w.files.length === 1 ? "file" : "files"}` : "No topic listed")}</span>
              {w.current ? <Tag tone="dark">This week</Tag> : <ChevronDownIcon size={18} />}
            </button>
            <Collapse open={isOpen}>
              {w.files.length ? (
                <div className={s.weekFiles}>
                  {w.files.map((f) => (
                    <FileItemRow key={f.id} file={f} />
                  ))}
                </div>
              ) : (
                <p className={s.weekEmpty}>No files for this week yet.</p>
              )}
            </Collapse>
          </div>
        );
      })}
      <div className={s.links}>
        {!everything && weeks.length > shown.length ? (
          <button type="button" className={s.ghost} onClick={() => setEverything(true)}>
            All {weeks.length} weeks
            <ChevronRightIcon size={20} />
          </button>
        ) : null}
        {filesTotal ? (
          <Link href={filesHref} className={s.ghost} prefetch>
            All {filesTotal} files
            <ChevronRightIcon size={20} />
          </Link>
        ) : null}
      </div>
      {extra}
    </>
  );
}

const FILTERS: Array<{ label: string; types: FileItem["type"][] }> = [
  { label: "Lectures", types: ["lecture", "lab", "practice"] },
  { label: "Exams", types: ["exam", "mock"] },
  { label: "Notes", types: ["notes", "assignment"] },
  { label: "Syllabus", types: ["syllabus", "book"] },
  { label: "Other", types: ["other"] },
];

/** All files with type filters, grouped by week, newest week first (4.7). */
export function FilesBrowser({ files, topics }: { files: FileItem[]; topics: Record<number, string> }) {
  const [filter, setFilter] = useState<string | null>(null);
  const counts = FILTERS.map((f) => ({ ...f, n: files.filter((x) => f.types.includes(x.type)).length })).filter((f) => f.n > 0);
  const active = counts.find((f) => f.label === filter);
  const list = active ? files.filter((x) => active.types.includes(x.type)) : files;
  const groups = byWeek(list).sort((a, b) => (b.week ?? -1) - (a.week ?? -1));
  return (
    <>
      <div className={s.filters} role="group" aria-label="File type">
        <Chip label={`All ${files.length}`} selected={!active} onClick={() => setFilter(null)} />
        {counts.map((f) => (
          <Chip key={f.label} label={`${f.label} ${f.n}`} selected={active?.label === f.label} onClick={() => setFilter(f.label)} />
        ))}
      </div>
      <div className={s.groups}>
        {groups.map((g) => (
          <section key={g.week ?? "course"} className={s.group}>
            <h3 className={b.label}>{g.week === null ? "Whole course" : `Week ${g.week}${topics[g.week] ? ` · ${topics[g.week]}` : ""}`}</h3>
            {g.files.map((f) => (
              <FileItemRow key={f.id} file={f} />
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

/** A t.me link: Telegram opens it natively in the Mini App, a new tab elsewhere. */
export function TelegramLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        e.preventDefault();
        openTelegramLink(href);
      }}
    >
      {children}
    </a>
  );
}
