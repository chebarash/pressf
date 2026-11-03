import { path } from "@/core/links";
import type { IconName } from "./icons";

/**
 * Desktop sidebar items, their shortcuts and paths. Every section is F (for
 * Press F) then its letter: F T Timetable, F C Courses. Never while typing in a
 * field or with a modifier held; read from the physical key on any layout.
 */
export const NAV_PREFIX = "f";

export type NavItem = { label: string; href: string; icon: IconName; key: string; group: "main" | "browse"; badge?: "new" | "count" };

export const NAV: NavItem[] = [
  { label: "Today", href: path({ to: "today" }), icon: "pin", key: "h", group: "main" },
  { label: "Timetable", href: path({ to: "timetable" }), icon: "clock", key: "t", group: "main" },
  { label: "Courses", href: path({ to: "courses" }), icon: "book", key: "c", group: "main" },
  { label: "Progress", href: path({ to: "progress" }), icon: "check", key: "p", group: "main" },
  { label: "Notifications", href: path({ to: "notifications" }), icon: "mail", key: "n", group: "main", badge: "count" },
  { label: "Professors", href: "/professors", icon: "users", key: "r", group: "browse" },
  { label: "Curriculum", href: "/programs", icon: "file", key: "u", group: "browse" },
];

/**
 * F-shortcuts to a view of a section, not in the sidebar: F K opens Timetable on
 * its month (Calendar was merged into Timetable; K was its letter).
 */
export const NAV_VIEWS: Array<{ label: string; href: string; key: string }> = [
  { label: "Timetable · Month", href: path({ to: "timetable", view: "month" }), key: "k" },
];

/** Active when the path is the item's or below it (Today only on "/"). */
export const isActive = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
