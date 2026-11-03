"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Prefetches `href` in full as soon as the pointer or focus reaches what it wraps,
 * so opening a file or a course from a list doesn't show a loading screen.
 */
export function Prefetch({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  const go = () => {
    if (href.startsWith("/")) router.prefetch(href);
  };
  return (
    <span style={{ display: "contents" }} onMouseEnter={go} onFocus={go}>
      {children}
    </span>
  );
}
