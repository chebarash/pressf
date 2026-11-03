import type { AlertSettings } from "@/core/notifications";
import type { ProfileView } from "@/server/views";
import { SwitchGroup } from "./mc/kit";
import { cx, Screen } from "./mc/parts";
import { AlertSwitch } from "./mc/ProfileControls";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

type Row = { key: keyof AlertSettings; label: string; hint: string };

const EVERY_DAY: Row[] = [
  { key: "digest", label: "Morning digest", hint: "07:30 on school days" },
  { key: "classReminder", label: "Class reminders", hint: "15 minutes before" },
  { key: "qrReminder", label: "QR check-in reminder", hint: "5 minutes into a class" },
  { key: "absence", label: "Absences", hint: "When LMS marks one" },
  { key: "grade", label: "New grades", hint: "As soon as they're in" },
  { key: "file", label: "New files", hint: "Bundled, at most once an hour" },
  { key: "announcement", label: "LMS announcements", hint: "Teachers and university" },
  { key: "deadline", label: "Deadlines", hint: "48 h and 3 h before" },
  { key: "anonymous", label: "Replies on Anonymous", hint: "Your posts only" },
];

const SEMESTER: Row[] = [
  { key: "registration", label: "Registration and add/drop", hint: "Cohort selection, add/drop windows" },
  { key: "exams", label: "Exams", hint: "Week before and evening before" },
  { key: "rating", label: "Rating reminders", hint: "After final grades, up to 3 times" },
];

/** Mobile Alerts settings (Figma 8.5): what the bot sends, per type. Quiet hours from core (22:00–08:00). */
export default function Alerts({ data }: { data: ProfileView }) {
  return (
    <Screen className={s.noTopBar}>
      <div className={cx(s.body, s.tight)}>
        <h1 className={cx(s.title, "t-mobile-title")}>Alerts</h1>
        <p className={cx(s.p0, s.t14, s.soft)} style={{ lineHeight: 1.4 }}>
          What the Press F bot sends you in Telegram. Quiet hours 22:00–08:00.
        </p>
        {!data.telegramLinked ? <p className={cx(s.p0, s.t13, s.lowText)}>Open Press F from the bot once to link Telegram; these apply after that.</p> : null}
        {(
          [
            ["Every day", EVERY_DAY],
            ["Semester", SEMESTER],
          ] as const
        ).map(([title, rows]) => (
          <section key={title} className={c.block8}>
            <h2 className={s.label}>{title}</h2>
            <SwitchGroup>
              {rows.map((r) => (
                <AlertSwitch key={r.key} name={r.key} label={r.label} hint={r.hint} on={data.alerts[r.key] ?? true} />
              ))}
            </SwitchGroup>
          </section>
        ))}
      </div>
    </Screen>
  );
}
