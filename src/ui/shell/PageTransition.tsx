"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, ViewTransition } from "react";
import { markHydrated } from "@/ui/motion";

/**
 * The page a path belongs to. Tabs that live in the path (/c/MATH111/files,
 * /c/MATH111/anonymous) stay on their course page, so switching them neither
 * fades the screen nor scrolls it.
 */
export function pageKey(pathname: string): string {
  const course = /^\/c\/[^/]+/.exec(pathname);
  if (course) return course[0];
  return pathname.replace(/\/+$/, "") || "/";
}

/**
 * Every navigation behaves the same way (shell.css, "Page change"):
 * - a new page cross-fades in (desktop: the main pane in place; mobile: a short
 *   fade-rise) and starts at the top;
 * - a tab, filter or query change on the same page swaps in place: no fade, the
 *   scroll position stays;
 * - Back and Forward restore where the page was (the browser and the router do that).
 * Uses the browser's View Transitions through React; where they are not
 * supported the new screen simply appears. The shell around <main> (sidebar,
 * top bar) never takes part.
 *
 * Inside a ViewTransition React holds a navigation's commit until new plain
 * <img> elements decode (up to 800 ms). Screens use next/image (it has an
 * onLoad, which opts out) or inline SVG; give any new plain <img> under <main>
 * loading="lazy" so navigation never waits for it.
 */
export function PageTransition({ mobile, children }: { mobile: boolean; children: React.ReactNode }) {
  const key = pageKey(usePathname() ?? "/");
  const [shown, setShown] = useState(key);
  const [moving, setMoving] = useState(false);
  if (shown !== key) {
    setShown(key);
    setMoving(true);
  }
  // Back/Forward: leave the scroll position to the browser.
  const popped = useRef(false);
  useEffect(() => {
    markHydrated();
    let timer = 0;
    const onPop = () => {
      popped.current = true;
      // A Back that stays on the same page never commits a page change; forget it soon after.
      clearTimeout(timer);
      timer = window.setTimeout(() => (popped.current = false), 1000);
    };
    addEventListener("popstate", onPop);
    return () => {
      removeEventListener("popstate", onPop);
      clearTimeout(timer);
    };
  }, []);
  // A new page opens at the top, before it is painted (and before the view transition captures it).
  useLayoutEffect(() => {
    if (!moving) return;
    if (!popped.current) window.scrollTo(0, 0);
    popped.current = false;
  }, [moving]);
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
