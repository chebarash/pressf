"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, ViewTransition } from "react";

/**
 * A short fade of the screen when the route changes (shell.css, "Page change").
 * Uses the browser's View Transitions through React; where they are not
 * supported the new screen simply appears. Only a change of pathname animates:
 * refreshes after a mutation, filters in the query string and anything else
 * that runs in a transition on the same page stay instant. The shell around
 * <main> (sidebar, top bar) never takes part.
 *
 * Inside a ViewTransition React holds a navigation's commit until new plain
 * <img> elements decode (up to 800 ms). Screens use next/image (it has an
 * onLoad, which opts out) or inline SVG; give any new plain <img> under <main>
 * loading="lazy" so navigation never waits for it.
 */
export function PageTransition({ mobile, children }: { mobile: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [shown, setShown] = useState(pathname);
  const [moving, setMoving] = useState(false);
  if (shown !== pathname) {
    setShown(pathname);
    setMoving(true);
  }
  // The navigation commit has started its transition; later updates on this page don't animate.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one reset after the navigation commit
    if (moving) setMoving(false);
  }, [moving]);
  return (
    <ViewTransition default="none" update={moving ? (mobile ? "pf-screen" : "pf-pane") : "none"}>
      {children}
    </ViewTransition>
  );
}
