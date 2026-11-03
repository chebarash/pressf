/**
 * A small iCalendar (RFC 5545) writer for subscribed calendars. Timed events
 * are written in UTC (…Z), so no VTIMEZONE is needed; all-day events use dates.
 */

export type IcsEvent = {
  /** Stable per event, so a re-poll replaces it instead of adding a copy. */
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
} & ({ start: Date; end: Date } | { day: string; endDay: string });

export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** 20261102T050000Z */
export const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** 2026-11-02 → 20261102 */
const icsDate = (day: string) => day.replace(/-/g, "");
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Lines longer than 75 octets continue on the next line after a space, never inside a UTF-8 character. */
export function foldLine(line: string) {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    const limit = out.length ? 74 : 75;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

function vevent(e: IcsEvent, stamp: string) {
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`];
  if ("start" in e) lines.push(`DTSTART:${icsUtc(e.start)}`, `DTEND:${icsUtc(e.end > e.start ? e.end : e.start)}`);
  else lines.push(`DTSTART;VALUE=DATE:${icsDate(e.day)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(e.endDay >= e.day ? e.endDay : e.day))}`, "TRANSP:TRANSPARENT");
  lines.push(`SUMMARY:${icsText(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  lines.push("END:VEVENT");
  return lines;
}

/** A whole subscribed calendar; asks clients to re-poll hourly. */
export function icsCalendar(opts: { name: string; description?: string; events: IcsEvent[]; now: Date; timezone?: string }) {
  const stamp = icsUtc(opts.now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Press F//Personal calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(opts.name)}`,
    ...(opts.description ? [`X-WR-CALDESC:${icsText(opts.description)}`] : []),
    `X-WR-TIMEZONE:${opts.timezone ?? "Asia/Tashkent"}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...opts.events.flatMap((e) => vevent(e, stamp)),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Google Calendar's "add by URL" page for a feed; webcal:// makes it a subscription Google keeps polling. */
export const googleSubscribeUrl = (feedUrl: string) =>
  `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedUrl.replace(/^https?:\/\//, "webcal://"))}`;
