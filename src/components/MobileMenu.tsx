"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [["/schools", "Schools"], ["/courses", "Courses"], ["/professors", "Professors"], ["/files", "Files"], ["/calendar", "Calendar"]];

export function MobileMenu({ group }: { group: string | null }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the menu closes when the page changes
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button className="key btn sm menu-btn" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button>
      {open && (
        <nav id="mobile-menu" className="menu-panel" aria-label="Sections">
          {LINKS.map(([href, label]) => <Link key={href} className="d-sm" href={href}>{label}</Link>)}
          <Link className="d-sm accent" href={group ? "/me" : "/me/group"}>{group ? "My semester" : "Add group"}</Link>
        </nav>
      )}
    </>
  );
}
