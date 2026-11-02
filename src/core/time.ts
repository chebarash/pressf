/**
 * Time helpers. The university runs on Tashkent time (UTC+5, no DST), whatever
 * the server or the student's device says, so every "today" is computed there.
 */

export const TZ_OFFSET_MS = 5 * 3600_000;
export const DAY_MS = 86_400_000;

/** A Date shifted so its UTC fields read as Tashkent wall-clock time. */
export const toLocal = (date: Date) => new Date(date.getTime() + TZ_OFFSET_MS);

/** YYYY-MM-DD of the Tashkent calendar day. */
export const localDay = (date: Date) => toLocal(date).toISOString().slice(0, 10);

/** Minutes since Tashkent midnight. */
export const localMinutes = (date: Date) => {
  const local = toLocal(date);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

/** 0 = Sunday … 6 = Saturday, in Tashkent. */
export const localWeekday = (date: Date) => toLocal(date).getUTCDay();

/** The instant of Tashkent midnight that starts `day` (YYYY-MM-DD). */
export const dayStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - TZ_OFFSET_MS);

export const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** "10:00" in Tashkent. */
export const clock = (date: Date) => toLocal(date).toISOString().slice(11, 16);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "2 Nov" for a YYYY-MM-DD day or a Date. */
export const shortDate = (value: string | Date) => {
  const day = typeof value === "string" ? value : localDay(value);
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
};

export const weekdayName = (value: string | Date) =>
  WEEKDAYS[typeof value === "string" ? new Date(`${value}T00:00:00Z`).getUTCDay() : localWeekday(value)];

/** "now", "5 min ago", "3 h ago", "yesterday", "2 Nov". */
export function ago(date: Date, now: Date) {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min ago`;
  if (localDay(date) === localDay(now)) return `${Math.floor(minutes / 60)} h ago`;
  if (localDay(date) === addDays(localDay(now), -1)) return "yesterday";
  return shortDate(date);
}

/** "in 25 min", "in 2 h", "tomorrow", "in 3 days". */
export function until(date: Date, now: Date) {
  const minutes = Math.ceil((date.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  if (localDay(date) === localDay(now)) return `in ${Math.round(minutes / 60)} h`;
  const days = daysBetween(localDay(now), localDay(date));
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
