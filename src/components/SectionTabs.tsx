"use client";

import { useEffect, useRef, useState } from "react";

export type SectionTab = { id: string; label: string; count?: number; unit?: string };

/** Shows which section is on screen, and keeps counts apart from the labels. */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const [active, setActive] = useState(tabs[0].id);
  const bar = useRef<HTMLElement>(null);
  const jumpingUntil = useRef(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < jumpingUntil.current || !bar.current) return;
      jumpingUntil.current = 0;
      const line = bar.current.getBoundingClientRect().bottom + 24;
      const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      const passed = tabs.filter((tab) => (document.getElementById(tab.id)?.getBoundingClientRect().top ?? Infinity) <= line);
      setActive((atEnd ? tabs.at(-1) : passed.at(-1))?.id ?? tabs[0].id);
    };
    const onScroll = () => { frame ||= requestAnimationFrame(update); };
    update();
    // The chosen tab stays lit through the jump, even if its section cannot reach the top.
    const settle = () => { cancelAnimationFrame(frame); frame = 0; jumpingUntil.current = 0; };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("scrollend", settle);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("scrollend", settle); cancelAnimationFrame(frame); };
  }, [tabs]);

  useEffect(() => {
    bar.current?.querySelector(".tab.on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active]);

  return (
    <nav ref={bar} className="wrap tabs" aria-label={label}>
      {tabs.map((tab) => (
        <a key={tab.id} className={`tab ${active === tab.id ? "on" : ""}`} href={`#${tab.id}`} aria-current={active === tab.id ? "location" : undefined}
          onClick={() => { jumpingUntil.current = Date.now() + 700; setActive(tab.id); }}>
          {tab.label}
          {!!tab.count && <span className="tab-count" title={`${tab.count} ${tab.unit ?? ""}`.trim()}><span className="sr-only">, </span>{tab.count}<span className="sr-only"> {tab.unit}</span></span>}
        </a>
      ))}
    </nav>
  );
}
