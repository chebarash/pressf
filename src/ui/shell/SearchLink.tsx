"use client";

import Link from "next/link";
import { useRef } from "react";
import { Icon } from "./icons";

/**
 * The top bar's search field: a link to Search that also takes focus during the
 * tap, so iOS raises the keyboard at once; Search's own field takes it over.
 */
export function SearchLink() {
  const catcher = useRef<HTMLInputElement>(null);
  return (
    <>
      <Link href="/search" className="sh-search" prefetch onClick={() => catcher.current?.focus({ preventScroll: true })}>
        <Icon name="search" size={18} />
        <span>Course, professor, file</span>
      </Link>
      <input ref={catcher} aria-hidden tabIndex={-1} className="sh-focus-catcher" />
    </>
  );
}
