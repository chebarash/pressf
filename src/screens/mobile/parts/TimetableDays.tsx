"use client";

import { useCallback, useState } from "react";
import { cx, Tag } from "@/ui/components";
import { Sheet } from "@/ui/shell/overlays";
import { ClockIcon, PinIcon, UsersIcon } from "@/ui/icons";
import b from "./base.module.css";
import { FileItemRow } from "./FileItemRow";
import { MainButton } from "./MainButton";
import s from "./Timetable.module.css";
import type { TimetableClass } from "../views";

const isTime = (v: string) => /^\d{1,2}:\d{2}$/.test(v);

/** The day's classes; tapping one opens the class sheet (3.2, 3.3). */
export function ClassList({ classes, weekday, openKey }: { classes: TimetableClass[]; weekday: string; openKey: string | null }) {
  const [key, setKey] = useState<string | null>(openKey);
  // When the sheet opened, for the QR window (read in the click handler, not during render).
  const [openedAt, setOpenedAt] = useState(0);
  const open = classes.find((c) => c.key === key) ?? null;
  const close = useCallback(() => setKey(null), []);
  // QR check-in is offered from 5 min before the class until it ends (core checkInOpen).
  const qr = !!open && (open.status === "now" || (open.status === "next" && openedAt >= new Date(open.start).getTime() - 5 * 60_000));
  return (
    <>
      <ul className={s.list}>
        {classes.map((c) => (
          <li key={c.key}>
            <ClassRow c={c} selected={c.key === key} onOpen={() => {
                setOpenedAt(Date.now());
                setKey(c.key);
              }} />
          </li>
        ))}
      </ul>
      {open ? (
        <Sheet label={open.name} onClose={close} className={s.sheet}>
          <ClassSheet c={open} weekday={weekday} />
          {qr ? <MainButton text="Scan QR" href="/qr" secondary={{ text: "Open course", href: `/c/${open.code}` }} /> : <MainButton text={`Open ${open.name}`} href={`/c/${open.code}`} />}
        </Sheet>
      ) : null}
    </>
  );
}

function ClassRow({ c, selected, onOpen }: { c: TimetableClass; selected: boolean; onOpen: () => void }) {
  const moved = c.changedFrom && !isTime(c.changedFrom) ? `${c.room ?? ""} (was ${c.changedFrom})` : c.room;
  const retimed = c.changedFrom && isTime(c.changedFrom) ? `moved from ${c.changedFrom}` : null;
  const details = [c.teacher?.name, moved, retimed].filter(Boolean).join(" · ");
  return (
    <button type="button" className={cx(s.row, (c.status === "next" || c.status === "now") && s.next, selected && s.selected)} onClick={onOpen} aria-haspopup="dialog">
      <span className={s.time}>{c.time}</span>
      <span className={s.body}>
        <span className={s.subject}>{c.name}</span>
        {details ? <span className={s.details}>{details}</span> : null}
      </span>
      {c.status === "now" ? <Tag tone="dark">Now</Tag> : c.status === "next" ? <Tag tone="dark">Next</Tag> : null}
    </button>
  );
}

function ClassSheet({ c, weekday }: { c: TimetableClass; weekday: string }) {
  return (
    <>
      <div className={s.tags}>
        {c.code ? <Tag tone="accent">{c.code}</Tag> : null}
        {c.lesson ? <Tag tone="accent">{c.lesson}</Tag> : null}
      </div>
      {c.status === "now" ? (
        <p className={s.now}>● Now · until {c.endTime}</p>
      ) : null}
      <h2 className={s.sheetTitle}>{c.name}</h2>
      <p className={s.fact}>
        <ClockIcon size={16} />
        {weekday} {c.time}–{c.endTime}
        {c.changedFrom && isTime(c.changedFrom) ? <span className={s.was}>{c.changedFrom}</span> : null}
      </p>
      {c.room ? (
        <p className={s.fact}>
          <PinIcon size={16} />
          {c.room}
          {c.changedFrom && !isTime(c.changedFrom) ? <span className={s.was}>{c.changedFrom}</span> : null}
        </p>
      ) : null}
      {c.teacher ? (
        <p className={s.fact}>
          <UsersIcon size={16} />
          {c.teacher.name}
        </p>
      ) : null}
      {c.exam ? <p className={s.fact}>{c.exam.note}</p> : null}
      {c.materials.length ? (
        <>
          <p className={b.label}>Materials for this class</p>
          {c.materials.map((f) => (
            <FileItemRow key={f.id} file={f} />
          ))}
        </>
      ) : null}
      {c.absences ? (
        <p className={s.absences}>
          <span>
            Absences in this course: {c.absences.missed} of {c.absences.limit}
          </span>
          <strong>{c.absences.left} left</strong>
        </p>
      ) : null}
    </>
  );
}
