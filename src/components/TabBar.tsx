"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/courses", "Courses", "M4 5h16v14H4zM8 5v14"],
  ["/professors", "Professors", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1-4 4-6 8-6s7 2 8 6"],
  ["/files", "Files", "M6 3h8l4 4v14H6zM14 3v4h4"],
  ["/calendar", "Calendar", "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"],
  ["/me/ratings", "Me", "M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0zM9 10h.01M15 10h.01M9 15c2 1.500 4 1.500 6 0"],
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map(([href, label, icon]) => (
        <Link key={href} href={href} className={path.startsWith(href) ? "on" : ""} aria-current={path.startsWith(href) ? "page" : undefined}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
          {label}
        </Link>
      ))}
    </nav>
  );
}
