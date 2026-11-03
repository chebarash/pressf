import type { TrendPoint } from "@/core/ratings";
import { clock, localDay, shortDate } from "@/core/time";

/** Small display rules shared by these screens (pure, unit-tested). */

/** "08:40" for today, "2 Nov" before that; "earlier" when unknown (5.5 banner). */
export function since(iso: string | null, now = new Date()) {
  if (!iso) return "earlier";
  const d = new Date(iso);
  return localDay(d) === localDay(now) ? clock(d) : shortDate(d);
}

/** "Fall 2024" → "F24" for the trend axis. */
export const termShort = (term: string) => `${term.trim()[0] ?? "?"}${term.match(/\d{2}(\d{2})/)?.[1] ?? ""}`;

/** "↑ 5 since F24" chip on the semester trend (7.4); null under two points. */
export function trendDelta(points: TrendPoint[]): string | null {
  if (points.length < 2) return null;
  const d = points[points.length - 1].value - points[0].value;
  return `${d > 0 ? "↑" : d < 0 ? "↓" : "="} ${Math.abs(d)} since ${termShort(points[0].term)}`;
}

/** Figma uses lower case inside a line: "Next: Quiz 6 · tomorrow 09:00". */
export const lowerDay = (label: string) => label.replace(/^(Today|Tomorrow)\b/, (w) => w.toLowerCase());

/** The line under "Add to Google Calendar". Google polls subscribed calendars itself, often only a few times a day. */
export const subscribeHint = (personal: boolean) =>
  personal
    ? "Your own calendar, with what you turn on under In Google Calendar. Google refreshes it on its own schedule, so changes can take a few hours to appear."
    : "The academic calendar: holidays, exam weeks and registration. Sign in to add your own classes and deadlines.";

export const RESET_CALENDAR_TEXT = "The Google Calendar you added from Press F stops updating. Add it again from Timetable with the new link.";

const SCHOOL_TONES: Array<[RegExp, "computing" | "engineering" | "management" | "humanities" | "medicine"]> = [
  [/comput|software|cyber|data|informat|\bai\b/i, "computing"],
  [/engineer|mechan|chemi|aero|energy/i, "engineering"],
  [/manag|business|econom/i, "management"],
  [/humanit|science|mathemat|language|social|law/i, "humanities"],
  [/medic|health|pharm/i, "medicine"],
];

/** School colour family from its name (7.8). */
export const schoolTone = (name: string) => SCHOOL_TONES.find(([re]) => re.test(name))?.[1] ?? null;

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-") || "x";
