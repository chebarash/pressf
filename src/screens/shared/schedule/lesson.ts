import type { ScheduleClass } from "@/server/views";

/**
 * The panel of one dated lesson, as lines: the desktop inspector and the
 * phone's sheet show exactly these, in this order, with their own row styles.
 */
export type LessonPanel = {
  tags: string[];
  title: string;
  /** "Now · until 11:20". */
  live: string | null;
  /** "Wed 4 Nov · 10:00–11:20". */
  when: string;
  /** The earlier time when the LMS moved the class ("10:00"). */
  whenWas: string | null;
  room: string | null;
  /** The earlier room when the LMS moved the class. */
  roomWas: string | null;
  teacher: string | null;
  /** The LMS lesson's name ("Lecture № 15") and description, and the syllabus topic of that week. */
  topic: { title: string | null; description: string | null; syllabus: string | null };
  attendance: { label: string; tone: "ok" | "late" | "bad" | "none"; qr: boolean } | null;
  absences: { line: string; left: string } | null;
  grade: string | null;
  exam: string | null;
  homework: Array<{ id: string; title: string; meta: string }>;
  files: ScheduleClass["lesson"]["files"];
  courseHref: string | null;
};

const isTime = (v: string | null) => !!v && /^\d{1,2}:\d{2}$/.test(v);
const TZ = "Asia/Tashkent";
const dateLine = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const clockOf = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export function lessonPanel(c: ScheduleClass): LessonPanel {
  const l = c.lesson;
  const marks = l.attendance;
  const tone = marks.mark === "present" ? "ok" : marks.mark === "late" ? "late" : marks.mark === "absent" ? "bad" : "none";
  return {
    tags: [c.code, l.type].filter(Boolean),
    title: c.name,
    live: c.status === "now" ? `Now · until ${c.endTime}` : null,
    when: `${dateLine(c.start)} · ${c.time}–${c.endTime}`,
    whenWas: isTime(c.changedFrom) ? c.changedFrom : null,
    room: c.room,
    roomWas: c.changedFrom && !isTime(c.changedFrom) ? c.changedFrom : null,
    teacher: c.teacher?.name ?? null,
    topic: { title: l.title, description: l.description, syllabus: l.syllabus },
    attendance: c.kind === "exam" ? null : { label: marks.label, tone, qr: marks.viaQr },
    absences: l.absences ? { line: `Absences in this course: ${l.absences.missed} of ${l.absences.limit}`, left: `${l.absences.left} left` } : null,
    grade: l.grade,
    exam: c.exam?.note ?? null,
    homework: l.homework.map((h) => ({ id: h.id, title: h.title, meta: [`Due ${clockOf(h.due)}`, h.status, h.grade !== null ? `${h.grade} points` : null].filter(Boolean).join(" · ") })),
    files: l.files,
    courseHref: c.code ? `/c/${c.code}` : null,
  };
}
