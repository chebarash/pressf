"use client";

import Link from "next/link";
import { useState } from "react";
import type { CourseListItem, CoursesData } from "../model";
import { css, cx, Hint, Icon, Pct } from "../parts";
import c from "./course.module.css";

/** Left pane of Courses: filter (/), semesters, the student's courses; ↑↓ or J/K move, Enter opens. */
export function CourseList({ courses, terms, current }: { courses: CourseListItem[]; terms: CoursesData["terms"] | null; current: string | null }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? courses.filter((x) => `${x.code} ${x.name}`.toLowerCase().includes(needle)) : courses;
  return (
    <nav className={c.list} aria-label="Your courses">
      <h1 className={c.listTitle}>Courses</h1>
      <label className={c.filter}>
        <Icon name="search" size={14} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              document.querySelector<HTMLElement>("[data-course-items] [data-nav-item]")?.focus();
            }
          }}
          placeholder="Filter courses"
          aria-label="Filter courses"
          data-key="/"
        />
        <Hint>/</Hint>
      </label>
      {terms && (
        <div className={c.terms}>
          {terms.map((t) => (
            <Link key={t.id} href={t.href} prefetch className={cx(css.chip, t.active && css.chipOn)} aria-current={t.active || undefined}>
              {t.label}
            </Link>
          ))}
        </div>
      )}
      <div className={cx(c.items, css.navList)} data-nav-list data-nav-arrows data-course-items>
        {shown.map((x) => (
          <Link key={x.href} href={x.href} prefetch className={cx(c.item, x.code === current && c.itemOn)} aria-current={x.code === current ? "page" : undefined} data-nav-item>
            <span className={c.itemTop}>
              <span>{x.code}</span>
              <Pct value={x.recommendPct} />
            </span>
            <span className={c.itemName}>{x.name}</span>
            <span className={c.itemMeta}>
              <span>{x.next}</span>
              {x.absences && <b>{x.absences}</b>}
            </span>
          </Link>
        ))}
        {shown.length === 0 && <p className={c.listHint}>{needle ? <>No course matches “{q}”.</> : "No courses in this semester."}</p>}
      </div>
      <p className={c.listHint}>↑ ↓ to move · Enter to open</p>
    </nav>
  );
}
