import { path } from "@/core/links";
import type { IconName } from "./icons";

/** Desktop sidebar items, their G-sequence shortcuts (G then the key) and paths. */
export type NavItem = { label: string; href: string; icon: IconName; key: string; group: "main" | "browse"; badge?: "new" | "count" };

export const NAV: NavItem[] = [
  { label: "Today", href: path({ to: "today" }), icon: "pin", key: "h", group: "main" },
  { label: "Timetable", href: path({ to: "timetable" }), icon: "clock", key: "t", group: "main" },
  { label: "Courses", href: path({ to: "courses" }), icon: "book", key: "c", group: "main" },
  { label: "Next semester", href: path({ to: "next" }), icon: "calendar", key: "s", group: "main", badge: "new" },
  { label: "Progress", href: path({ to: "progress" }), icon: "check", key: "p", group: "main" },
  { label: "Calendar", href: path({ to: "calendar" }), icon: "calendar", key: "k", group: "main" },
  { label: "Notifications", href: path({ to: "notifications" }), icon: "mail", key: "n", group: "main", badge: "count" },
  { label: "Professors", href: "/professors", icon: "users", key: "r", group: "browse" },
  { label: "Curriculum", href: "/programs", icon: "file", key: "u", group: "browse" },
];

/** Active when the path is the item's or below it (Today only on "/"). */
export const isActive = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
