"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveCourse } from "@/app/admin/actions";
import { cohortLabel, materialTotals, type CoverageCourse, type CoverageReport, type CoverageSchool, type CoverageUnit } from "@/core/coverage";
import { MOVE_TARGETS, PLACED_BY_LABEL, SCHOOLS, UNASSIGNED } from "@/core/placement";
import type { SortColumns } from "@/core/sort";
import { shortDate } from "@/core/time";
import { SortHeader, useSortedRows, type SortState } from "@/ui/table/Sort";
import { Chip, Head, Key, Label, cx, s } from "./ui";
import { useKeys } from "./useKeys";

type Filter = { school: string; program: string; year: string; show: "" | "none" | "lms" };

const fmt = (n: number) => n.toLocaleString("en-US");

type UnitKey = "name" | "running" | "covered" | "missing" | "pct" | "students";
const UNIT_COLUMNS: SortColumns<CoverageUnit, UnitKey> = {
  name: (u) => u.name, running: (u) => u.running, covered: (u) => u.covered, missing: (u) => u.running - u.covered, pct: (u) => u.pct, students: (u) => u.students,
};
type MatKey = "school" | "courses" | "lms" | "uploads" | "exams" | "syllabi" | "noFiles" | "lmsOnly";
const TOTAL_COLUMNS: SortColumns<ReturnType<typeof materialTotals> & { name: string }, MatKey> = {
  school: (x) => x.name, courses: (x) => x.courses, lms: (x) => x.lmsFiles, uploads: (x) => x.uploads, exams: (x) => x.exams, syllabi: (x) => x.syllabi, noFiles: (x) => x.noFiles, lmsOnly: (x) => x.lmsOnly,
};
type CourseKey = "code" | "course" | "cohort" | "lms" | "uploads" | "exams" | "syllabus" | "lastFile";
const COURSE_COLUMNS: SortColumns<CoverageCourse, CourseKey> = {
  code: (c) => c.code, course: (c) => c.name, cohort: (c) => (c.cohorts.length ? c.cohorts.map(cohortLabel).join(", ") : null),
  lms: (c) => c.lmsFiles, uploads: (c) => c.uploads, exams: (c) => c.exams, syllabus: (c) => c.syllabus, lastFile: (c) => (c.lastFile ? new Date(c.lastFile) : null),
};

/**
 * Coverage: which courses running this semester have at least one active Press F
 * student (whose sign-in pulls the course's LMS files, lessons and syllabus), who
 * to recruit next, and what materials each course has. Counts only.
 */
export function Coverage({ data, tab, filter, canMove }: { data: CoverageReport; tab: "school" | "materials"; filter: Filter; canMove: boolean }) {
  const router = useRouter();
  const go = (t: "school" | "materials") => router.replace(t === "materials" ? "/admin/coverage?tab=materials" : "/admin/coverage");
  useKeys({ "1": () => go("school"), "2": () => go("materials") });
  const t = data.totals;
  const sem = data.semester.name ?? "This semester";

  return (
    <section className={s.main}>
      <Head title="Coverage" sub={`${sem} · a course's LMS files, lessons and syllabus come in only when a student who takes it signs in`} />
      <div className={s.kpis}>
        <Tile value={fmt(t.running)} label="courses running" sub={sem} />
        <Tile tint={t.pct < 50 ? s.tintRust : t.pct < 80 ? s.tintMustard : s.tintMoss} value={`${t.pct}%`} label="covered" sub={`${fmt(t.covered)} of ${fmt(t.running)} have a student on Press F`} />
        <Tile value={fmt(t.students)} label="students this semester" sub={`of ${fmt(t.activeAccounts)} working LMS logins`} />
        <Tile tint={t.noFiles ? s.tintRust : undefined} value={fmt(t.noFiles)} label="courses with no files" sub={`${fmt(t.lmsOnly)} more have LMS files only`} />
      </div>
      <div className={s.hstack}>
        <div className={s.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === "school"} className={cx(s.chip, tab === "school" && s.chipInverse)} onClick={() => go("school")}>By school</button>
          <button type="button" role="tab" aria-selected={tab === "materials"} className={cx(s.chip, tab === "materials" && s.chipInverse)} onClick={() => go("materials")}>Materials</button>
          <Key>1</Key>
          <Key>2</Key>
        </div>
        <div className={s.spacer} />
        <span className={s.note}>Refreshes every minute</span>
        <a className={s.link} href={`/admin/coverage/export?table=${tab === "materials" ? "materials" : "coverage"}`} download>Export CSV</a>
      </div>
      {t.running === 0 ? (
        <section className={cx(s.card, s.empty)}>
          <h2 className={s.emptyTitle}>No courses for {sem} yet</h2>
          <p className={s.emptyText}>They appear after the catalog harvest or once a student syncs this semester.</p>
        </section>
      ) : tab === "school" ? (
        <BySchool data={data} canMove={canMove} />
      ) : (
        <Materials data={data} initial={filter} />
      )}
    </section>
  );
}

function Tile({ tint, value, label, sub }: { tint?: string; value: string; label: string; sub: string }) {
  return (
    <div className={cx(s.card, s.kpi, tint)}>
      <span className={s.kpiValue}>{value}</span>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiSub}>{sub}</span>
    </div>
  );
}

function Meter({ pct, width = 120 }: { pct: number; width?: number }) {
  return (
    <span className={s.meter} style={{ width }} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% covered`}>
      <span className={cx(s.meterFill, pct < 50 ? s.meterLow : pct < 80 && s.meterMid)} style={{ width: `${pct}%` }} />
    </span>
  );
}

function UnitRow({ u }: { u: CoverageUnit }) {
  return (
    <div className={s.tr}>
      <span className={cx(s.td, s.tdGrow)} title={u.name}>{u.name}</span>
      <span className={cx(s.td, s.tdNum)} style={{ width: 70 }}>{u.running}</span>
      <span className={cx(s.td, s.tdNum)} style={{ width: 70 }}>{u.covered}</span>
      <span className={cx(s.td, s.tdNum)} style={{ width: 70 }}>{u.running - u.covered}</span>
      <span className={s.td} style={{ width: 170, display: "flex", gap: 8, alignItems: "center" }}>
        <Meter pct={u.pct} width={110} />
        <span className={s.tdNum} style={{ width: 40 }}>{u.pct}%</span>
      </span>
      <span className={cx(s.td, s.tdNum)} style={{ width: 70 }}>{u.students}</span>
    </div>
  );
}

type PlaceKey = "code" | "course" | "department" | "by" | "cohort" | "students";
const PLACE_COLUMNS: SortColumns<CoverageCourse, PlaceKey> = {
  code: (c) => c.code, course: (c) => c.name, department: (c) => c.department, by: (c) => c.placedBy, cohort: (c) => (c.cohorts.length ? c.cohorts.map(cohortLabel).join(", ") : null), students: (c) => c.students,
};

function BySchool({ data, canMove }: { data: CoverageReport; canMove: boolean }) {
  const placed = data.totals.running - data.totals.unassigned;
  return (
    <div className={s.row2}>
      <div style={{ flex: "1 0 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        <p className={s.small} style={{ margin: 0 }}>
          {placed} of {data.totals.running} courses placed: by an admin&apos;s move, else the LMS department, else the department most of its teachers belong to on newuu.uz, else its code.
          {data.totals.unassigned > 0 && ` ${data.totals.unassigned} still unassigned.`}
        </p>
        {data.schools.map((sc) => (
          <section key={sc.key} className={s.card} aria-label={sc.name}>
            <div className={s.hstack} style={{ gap: 12 }}>
              <h2 className={s.h4} style={{ flex: 1, minWidth: 0 }}>{sc.name}</h2>
              <Meter pct={sc.pct} width={160} />
              <span className={s.kpiLabel}>{sc.pct}%</span>
            </div>
            <div className={s.small}>
              {sc.covered} of {sc.running} courses covered · {sc.students} student{sc.students === 1 ? "" : "s"} on Press F take{sc.students === 1 ? "s" : ""} its courses
            </div>
            {sc.name !== UNASSIGNED && <Departments school={sc} />}
            <CourseList list={data.courses.filter((c) => c.school === sc.name)} open={sc.name === UNASSIGNED} canMove={canMove} />
          </section>
        ))}
      </div>
      <Recruit data={data} />
    </div>
  );
}

/** A school's departments (hidden when the school is its only department). */
function Departments({ school }: { school: CoverageSchool }) {
  const { rows, state } = useSortedRows(school.departments, UNIT_COLUMNS);
  if (school.departments.length === 1 && school.departments[0].name === school.name) return null;
  return (
    <div className={s.table} style={{ padding: 0, gap: 0 }}>
      <div className={cx(s.tr, s.trHead)} role="row">
        <SortHeader state={state} k="name" className={cx(s.td, s.tdGrow)}>DEPARTMENT</SortHeader>
        <SortHeader state={state} k="running" className={cx(s.td, s.tdNum)} style={{ width: 70 }}>RUNNING</SortHeader>
        <SortHeader state={state} k="covered" className={cx(s.td, s.tdNum)} style={{ width: 70 }}>COVERED</SortHeader>
        <SortHeader state={state} k="missing" className={cx(s.td, s.tdNum)} style={{ width: 70 }}>MISSING</SortHeader>
        <SortHeader state={state} k="pct" className={s.td} style={{ width: 170 }}>COVERAGE</SortHeader>
        <SortHeader state={state} k="students" className={cx(s.td, s.tdNum)} style={{ width: 70 }}>STUDENTS</SortHeader>
      </div>
      {rows.map((d) => <UnitRow key={d.key} u={d} />)}
    </div>
  );
}

const HINT = {
  override: "Moved here by an admin",
  lms: "The course's department on the LMS",
  teachers: "The department most of its teachers belong to on newuu.uz (lecturers count most)",
  code: "Guessed from the course code",
} as const;

/** Every course of a school: where its placement came from, and (for admins) a move. */
function CourseList({ list, open, canMove }: { list: CoverageCourse[]; open: boolean; canMove: boolean }) {
  const { rows, state } = useSortedRows(list, PLACE_COLUMNS);
  const uncovered = list.filter((c) => !c.covered).length;
  return (
    <details className={s.details} open={open}>
      <summary>{list.length} course{list.length === 1 ? "" : "s"} · {uncovered} uncovered</summary>
      <div className={s.table} style={{ padding: 0, gap: 0 }}>
        <div className={cx(s.tr, s.trHead)} role="row">
          <SortHeader state={state} k="code" className={s.td} style={{ width: 90 }}>CODE</SortHeader>
          <SortHeader state={state} k="course" className={cx(s.td, s.tdGrow)}>COURSE</SortHeader>
          <SortHeader state={state} k="department" className={s.td} style={{ width: 150 }}>DEPARTMENT</SortHeader>
          <SortHeader state={state} k="by" className={s.td} style={{ width: 84 }}>FROM</SortHeader>
          <SortHeader state={state} k="cohort" className={s.td} style={{ width: 190 }}>COHORT</SortHeader>
          <SortHeader state={state} k="students" className={cx(s.td, s.tdNum)} style={{ width: 70 }}>STUDENTS</SortHeader>
          {canMove && <span className={s.td} style={{ width: 150 }} />}
        </div>
        {rows.map((c) => (
          <div key={c.code} className={s.tr}>
            <Link href={`/admin/courses/${encodeURIComponent(c.code)}`} prefetch={false} className={cx(s.td, s.tdStrong)} style={{ width: 90 }}>{c.code}</Link>
            <span className={cx(s.td, s.tdGrow)} title={c.name}>{c.name}</span>
            <span className={s.td} style={{ width: 150 }} title={c.department}>{c.placedBy ? c.department : "—"}</span>
            <span className={cx(s.td, s.tdChip)} style={{ width: 84 }} title={c.placedBy ? HINT[c.placedBy] : "No LMS department, no teacher with a known department, no known code prefix"}>
              {c.placedBy ? <Chip tone={c.placedBy === "override" ? "plum" : c.placedBy === "code" ? "mustard" : "plain"}>{PLACED_BY_LABEL[c.placedBy]}</Chip> : <Chip tone="rust">none</Chip>}
            </span>
            <span className={s.td} style={{ width: 190 }} title={c.cohorts.map(cohortLabel).join(", ")}>
              {c.cohorts.length ? c.cohorts.map(cohortLabel).join(", ") : "No cohort plan yet"}
            </span>
            <span className={cx(s.td, s.tdNum, c.covered && s.tdStrong)} style={{ width: 70 }}>{c.students}</span>
            {canMove && <MoveTo course={c} />}
          </div>
        ))}
      </div>
    </details>
  );
}

const AUTO = "auto";
const PROMPT = "move";
const targetValue = (school: string, department: string | null) => `${school}|${department ?? ""}`;

/** "Move to…": pins the course to a school/department (wins over everything), or back to automatic. Audited. */
function MoveTo({ course }: { course: CoverageCourse }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const change = (value: string) =>
    start(async () => {
      setError(null);
      const [school, department] = value === AUTO ? [null, null] : value.split("|");
      const r = await moveCourse(course.code, school, department || null);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  const pinned = course.placedBy === "override" ? MOVE_TARGETS.find((t) => t.school === course.school && (t.department ?? "School-wide") === course.department) : undefined;
  return (
    <span className={s.td} style={{ width: 150 }}>
      <select
        className={s.chip}
        value={pinned ? targetValue(pinned.school, pinned.department) : PROMPT}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        aria-label={`Move ${course.code} to`}
        title={error ?? undefined}
        style={{ maxWidth: 150 }}
      >
        <option value={PROMPT} disabled>{pending ? "Moving…" : error ? "Failed: retry" : "Move to…"}</option>
        {pinned && <option value={AUTO}>Back to automatic</option>}
        {SCHOOLS.map((sc) => (
          <optgroup key={sc.name} label={sc.name}>
            {MOVE_TARGETS.filter((t) => t.school === sc.name).map((t) => (
              <option key={targetValue(t.school, t.department)} value={targetValue(t.school, t.department)}>{t.department ?? "School-wide"}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </span>
  );
}

function Recruit({ data }: { data: CoverageReport }) {
  const gain = data.suggestions.reduce((n, x) => n + x.gain, 0);
  return (
    <section className={s.card} style={{ width: 400, flexShrink: 0, position: "sticky", top: 0 }} aria-label="Recruit next">
      <h2 className={s.h3}>Recruit next</h2>
      <p className={s.small} style={{ margin: 0 }}>
        One student from each cohort, in this order, covers the most courses still missing.
        {data.suggestions.length > 0 && ` These ${data.suggestions.length} cover ${gain} of ${data.totals.running - data.totals.covered}.`}
      </p>
      {data.suggestions.length === 0 && <p className={s.small}>{data.totals.covered === data.totals.running ? "Every running course has a student. Nothing to recruit." : "No cohort plans cover the missing courses yet. Plans come in as students sign in."}</p>}
      {data.suggestions.map((x, i) => (
        <div key={`${x.programId}|${x.year}`} className={s.hstack} style={{ alignItems: "flex-start", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--border-subtle)" : undefined }}>
          <span className={s.rank}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <div className={s.hstack}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14 }}>{cohortLabel(x)}</span>
              <Chip tone="moss">+{x.gain}</Chip>
            </div>
            <span className={s.small}>{x.school} · {x.uncovered} of {x.total} courses uncovered</span>
            <span className={s.codes}>{x.courses.map((c) => c.code).join(", ")}</span>
          </div>
        </div>
      ))}
      {data.totals.noCohort > 0 && (
        <p className={s.small} style={{ margin: 0 }}>
          {data.totals.noCohort} uncovered course{data.totals.noCohort === 1 ? " has" : "s have"} no cohort plan yet: any student who takes {data.totals.noCohort === 1 ? "it" : "them"} covers {data.totals.noCohort === 1 ? "it" : "them"}.
        </p>
      )}
    </section>
  );
}

function Materials({ data, initial }: { data: CoverageReport; initial: Filter }) {
  const [f, setF] = useState<Filter>(initial);
  const set = (patch: Partial<Filter>) => {
    const next = { ...f, ...patch };
    setF(next);
    const q = new URLSearchParams(Object.entries({ tab: "materials", ...next }).filter(([, v]) => v) as Array<[string, string]>);
    try {
      window.history.replaceState(null, "", `/admin/coverage?${q}`);
    } catch {
      // The filter still works without the address bar.
    }
  };
  const list = data.courses.filter(
    (c) =>
      (!f.school || c.school === f.school) &&
      (!f.program || c.cohorts.some((h) => h.programId === f.program)) &&
      (!f.year || c.cohorts.some((h) => String(h.year) === f.year)) &&
      (f.show !== "none" || (!c.lmsFiles && !c.uploads)) &&
      (f.show !== "lms" || (c.lmsFiles > 0 && !c.uploads)),
  );
  const schools = data.schools.map((x) => x.name).sort();
  const totals = schools
    .map((name) => ({ name, ...materialTotals(list.filter((c) => c.school === name)) }))
    .filter((x) => x.courses > 0);
  const all = materialTotals(list);
  const sortedTotals = useSortedRows(totals, TOTAL_COLUMNS);
  const sortedList = useSortedRows(list, COURSE_COLUMNS);

  return (
    <>
      <div className={s.hstack}>
        <select className={s.chip} value={f.school} onChange={(e) => set({ school: e.target.value })} aria-label="School">
          <option value="">All schools</option>
          {schools.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className={s.chip} value={f.program} onChange={(e) => set({ program: e.target.value })} aria-label="Program">
          <option value="">All programs</option>
          {data.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={s.chip} value={f.year} onChange={(e) => set({ year: e.target.value })} aria-label="Year of study">
          <option value="">All years</option>
          {data.years.map((y) => <option key={y} value={String(y)}>Year {y}</option>)}
        </select>
        <select className={s.chip} value={f.show} onChange={(e) => set({ show: e.target.value as Filter["show"] })} aria-label="Show">
          <option value="">Every course</option>
          <option value="none">No files at all</option>
          <option value="lms">LMS files only</option>
        </select>
        <span className={s.note}>{list.length} of {data.courses.length} courses</span>
      </div>
      <section className={cx(s.card, s.table)} aria-label="Totals per school">
        <div className={cx(s.tr, s.trHead)}>
          <SortHeader state={sortedTotals.state} k="school" className={cx(s.td, s.tdGrow)}>SCHOOL</SortHeader>
          <MatHead state={sortedTotals.state} />
          <SortHeader state={sortedTotals.state} k="noFiles" className={cx(s.td, s.tdNum)} style={{ width: 80 }}>NO FILES</SortHeader>
          <SortHeader state={sortedTotals.state} k="lmsOnly" className={cx(s.td, s.tdNum)} style={{ width: 80 }}>LMS ONLY</SortHeader>
        </div>
        {sortedTotals.rows.map((x) => (
          <div key={x.name} className={s.tr}>
            <span className={cx(s.td, s.tdGrow, s.tdStrong)} title={x.name}>{x.name}</span>
            <MatCells m={x} />
            <span className={cx(s.td, s.tdNum, x.noFiles > 0 && s.tdStrong)} style={{ width: 80 }}>{x.noFiles}</span>
            <span className={cx(s.td, s.tdNum)} style={{ width: 80 }}>{x.lmsOnly}</span>
          </div>
        ))}
        {totals.length > 1 && (
          <div className={s.tr} style={{ borderBottom: 0 }}>
            <span className={cx(s.td, s.tdGrow, s.tdStrong)}>All</span>
            <MatCells m={all} />
            <span className={cx(s.td, s.tdNum, s.tdStrong)} style={{ width: 80 }}>{all.noFiles}</span>
            <span className={cx(s.td, s.tdNum)} style={{ width: 80 }}>{all.lmsOnly}</span>
          </div>
        )}
      </section>
      <section className={cx(s.card, s.table)} aria-label="Materials per course">
        <div className={cx(s.tr, s.trHead)}>
          <SortHeader state={sortedList.state} k="code" className={s.td} style={{ width: 90 }}>CODE</SortHeader>
          <SortHeader state={sortedList.state} k="course" className={cx(s.td, s.tdGrow)}>COURSE</SortHeader>
          <SortHeader state={sortedList.state} k="cohort" className={s.td} style={{ width: 220 }}>COHORT</SortHeader>
          <SortHeader state={sortedList.state} k="lms" className={cx(s.td, s.tdNum)} style={{ width: 70 }}>LMS</SortHeader>
          <SortHeader state={sortedList.state} k="uploads" className={cx(s.td, s.tdNum)} style={{ width: 80 }}>STUDENTS</SortHeader>
          <SortHeader state={sortedList.state} k="exams" className={cx(s.td, s.tdNum)} style={{ width: 70 }}>EXAMS</SortHeader>
          <SortHeader state={sortedList.state} k="syllabus" className={s.td} style={{ width: 70 }}>SYLLABUS</SortHeader>
          <SortHeader state={sortedList.state} k="lastFile" className={s.td} style={{ width: 80 }}>LAST FILE</SortHeader>
          <span className={s.td} style={{ width: 96 }} />
        </div>
        {list.length === 0 && <p className={s.small} style={{ padding: 12 }}>No course matches these filters.</p>}
        {sortedList.rows.map((c) => {
          const none = !c.lmsFiles && !c.uploads;
          const lmsOnly = c.lmsFiles > 0 && !c.uploads;
          return (
            <Link key={c.code} href={`/admin/courses/${encodeURIComponent(c.code)}`} prefetch={false} className={cx(s.tr, s.trLink, none && s.trWarn)}>
              <span className={cx(s.td, s.tdStrong)} style={{ width: 90 }}>{c.code}</span>
              <span className={cx(s.td, s.tdGrow)} title={c.name}>{c.name}</span>
              <span className={s.td} style={{ width: 220 }} title={c.cohorts.map(cohortLabel).join(", ")}>{c.cohorts.length ? c.cohorts.map(cohortLabel).join(", ") : "—"}</span>
              <span className={cx(s.td, s.tdNum)} style={{ width: 70 }}>{c.lmsFiles}</span>
              <span className={cx(s.td, s.tdNum)} style={{ width: 80 }}>{c.uploads}</span>
              <span className={cx(s.td, s.tdNum)} style={{ width: 70 }}>{c.exams}</span>
              <span className={s.td} style={{ width: 70 }}>{c.syllabus ? "Yes" : "No"}</span>
              <span className={s.td} style={{ width: 80 }}>{c.lastFile ? shortDate(new Date(c.lastFile)) : "—"}</span>
              <span className={cx(s.td, s.tdChip)} style={{ width: 96 }}>
                {none ? <Chip tone="rust">No files</Chip> : lmsOnly ? <Chip tone="mustard">LMS only</Chip> : !c.covered ? <Chip>No student</Chip> : null}
              </span>
            </Link>
          );
        })}
      </section>
      <Label>A ROW IS RED WHEN THE COURSE HAS NO FILES AT ALL · “LMS ONLY” MEANS NO STUDENT UPLOADS YET</Label>
    </>
  );
}

function MatHead({ state }: { state: SortState<MatKey> }) {
  return (
    <>
      <SortHeader state={state} k="courses" className={cx(s.td, s.tdNum)} style={{ width: 80 }}>COURSES</SortHeader>
      <SortHeader state={state} k="lms" className={cx(s.td, s.tdNum)} style={{ width: 80 }}>LMS FILES</SortHeader>
      <SortHeader state={state} k="uploads" className={cx(s.td, s.tdNum)} style={{ width: 110 }}>STUDENT FILES</SortHeader>
      <SortHeader state={state} k="exams" className={cx(s.td, s.tdNum)} style={{ width: 90 }}>PAST EXAMS</SortHeader>
      <SortHeader state={state} k="syllabi" className={cx(s.td, s.tdNum)} style={{ width: 80 }}>SYLLABI</SortHeader>
    </>
  );
}

function MatCells({ m }: { m: ReturnType<typeof materialTotals> }) {
  return (
    <>
      <span className={cx(s.td, s.tdNum)} style={{ width: 80 }}>{m.courses}</span>
      <span className={cx(s.td, s.tdNum)} style={{ width: 80 }}>{fmt(m.lmsFiles)}</span>
      <span className={cx(s.td, s.tdNum)} style={{ width: 110 }}>{fmt(m.uploads)}</span>
      <span className={cx(s.td, s.tdNum)} style={{ width: 90 }}>{fmt(m.exams)}</span>
      <span className={cx(s.td, s.tdNum)} style={{ width: 80 }}>{m.syllabi}</span>
    </>
  );
}
