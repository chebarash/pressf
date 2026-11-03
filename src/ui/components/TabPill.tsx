"use client";

import { ViewTransition } from "react";

/**
 * The ink pill behind the active tab. Every pill of one tab row shares a name,
 * so when the active tab changes (a navigation or any update in a transition)
 * the browser slides the pill from the old tab to the new one (shell.css,
 * "Tab pills"). Without View Transitions it simply moves.
 */
export function TabPill({ group, className }: { group: string; className?: string }) {
  return (
    <ViewTransition name={`pf-tab-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} share="pf-tab" default="none">
      <span className={className} aria-hidden="true" />
    </ViewTransition>
  );
}
