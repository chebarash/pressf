/**
 * Links between the web, the Telegram Mini App and the bot. One route table for
 * both front ends, and the short `startapp` codes Telegram allows (A–Z a–z 0–9 _ -,
 * up to 64 chars).
 */

export const SITE_URL = "https://pressf.chebarash.uz";
export const BOT_USERNAME = "pupressfbot";

export type Target =
  | { to: "today" }
  | { to: "timetable"; day?: string }
  | { to: "courses" }
  | { to: "course"; code: string; term?: string; tab?: "overview" | "files" | "anonymous" }
  | { to: "file"; id: string }
  | { to: "professor"; id: string }
  | { to: "progress"; courseId?: string }
  | { to: "notifications"; id?: string }
  | { to: "calendar" }
  | { to: "rate"; courseId?: string }
  | { to: "next"; code?: string }
  | { to: "qr" }
  | { to: "uploads" }
  | { to: "link"; token: string };

const slug = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");

/** The web path for a target (same paths serve desktop and the Mini App). */
export function path(t: Target): string {
  switch (t.to) {
    case "today": return "/";
    case "timetable": return t.day ? `/timetable?day=${t.day}` : "/timetable";
    case "courses": return "/courses";
    case "course": return `/c/${slug(t.code)}${t.tab && t.tab !== "overview" ? `/${t.tab}` : ""}${t.term ? `?term=${encodeURIComponent(t.term)}` : ""}`;
    case "file": return `/f/${slug(t.id)}`;
    case "professor": return `/p/${slug(t.id)}`;
    case "progress": return t.courseId ? `/progress/${slug(t.courseId)}` : "/progress";
    case "notifications": return t.id ? `/notifications?open=${encodeURIComponent(t.id)}` : "/notifications";
    case "calendar": return "/calendar";
    case "rate": return t.courseId ? `/rate/${slug(t.courseId)}` : "/rate";
    case "next": return t.code ? `/next/${slug(t.code)}` : "/next";
    case "qr": return "/qr";
    case "uploads": return "/me/uploads";
    case "link": return `/link/${slug(t.token)}`;
  }
}

/** `startapp` payload for t.me/<bot>?startapp=… (the bot's Main Mini App). */
export function startParam(t: Target): string {
  switch (t.to) {
    case "course": return `c_${slug(t.code)}`;
    case "file": return `f_${slug(t.id)}`;
    case "professor": return `p_${slug(t.id)}`;
    case "progress": return t.courseId ? `g_${slug(t.courseId)}` : "progress";
    case "rate": return t.courseId ? `r_${slug(t.courseId)}` : "rate";
    case "next": return t.code ? `n_${slug(t.code)}` : "next";
    case "notifications": return "inbox";
    case "link": return `l_${slug(t.token)}`;
    default: return t.to;
  }
}

export function parseStartParam(p: string | null | undefined): Target {
  if (!p) return { to: "today" };
  const [prefix, ...rest] = p.split("_");
  const value = rest.join("_");
  switch (prefix) {
    case "c": return value ? { to: "course", code: value } : { to: "courses" };
    case "f": return value ? { to: "file", id: value } : { to: "today" };
    case "p": return value ? { to: "professor", id: value } : { to: "today" };
    case "g": return { to: "progress", courseId: value || undefined };
    case "r": return { to: "rate", courseId: value || undefined };
    case "n": return { to: "next", code: value || undefined };
    case "l": return value ? { to: "link", token: value } : { to: "today" };
    case "inbox": return { to: "notifications" };
    case "upload": return { to: "uploads" };
    case "timetable": case "courses": case "progress": case "calendar": case "rate": case "next": case "qr": case "uploads": case "today":
      return { to: prefix } as Target;
    default: return { to: "today" };
  }
}

export const miniAppUrl = (t: Target, bot = BOT_USERNAME) => `https://t.me/${bot}?startapp=${startParam(t)}`;
export const webUrl = (t: Target, site = SITE_URL) => `${site}${path(t)}`;
/** Bot deep link for sharing a file into the bot with the course preselected. */
export const uploadLink = (courseCode: string, bot = BOT_USERNAME) => `https://t.me/${bot}?start=upload_${slug(courseCode)}`;
