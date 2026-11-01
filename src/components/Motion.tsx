"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const PRESS = "cubic-bezier(.2, 0, 0, 1)";
const REVEAL = ".card, .file, .line-row.link";
const NUMBERS = ".score, .bar-row .num, .bar-row .track i";
const STAGGER = 40;

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function play(element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
  if (calm()) return element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, fill: "backwards" });
  return element.animate(frames, { fill: "backwards", ...options });
}

/** Counts a number up in place. The text node stays the one React owns. */
function countUp(element: Element) {
  const node = element.firstChild;
  const text = node?.nodeValue ?? "";
  const target = Number(text);
  if (!node || !text || Number.isNaN(target) || calm()) return;
  const start = performance.now();
  const tick = (now: number) => {
    const progress = Math.min((now - start) / 600, 1);
    const eased = 1 - (1 - progress) ** 3;
    node.nodeValue = progress === 1 ? text : (target * eased).toFixed(1);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Plays the scroll motion of the design on whatever each page renders: cards rise
 * once, ratings count up and bars grow. Content is never hidden, so a page stays
 * readable before this loads.
 */
export function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    // The hero belongs to the first load, so coming back to home does not replay it.
    if (pathname !== "/") document.documentElement.dataset.heroSeen = "1";
    const seen = new WeakSet<Element>();
    const reveals = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).forEach((entry, index) => {
        reveals.unobserve(entry.target);
        play(entry.target, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 400, delay: index * STAGGER, easing: PRESS });
      });
    }, { threshold: .1 });
    const numbers = new IntersectionObserver((entries) => {
      for (const entry of entries.filter((item) => item.isIntersecting)) {
        numbers.unobserve(entry.target);
        if (entry.target.tagName === "I") play(entry.target, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 600, easing: PRESS });
        else countUp(entry.target);
      }
    }, { threshold: .3 });

    const scan = () => {
      for (const element of document.querySelectorAll(REVEAL)) {
        if (seen.has(element)) continue;
        seen.add(element);
        // What is already on screen stays put: it would flash away and come back.
        if (element.getBoundingClientRect().top > innerHeight) reveals.observe(element);
      }
      for (const element of document.querySelectorAll(NUMBERS)) {
        if (seen.has(element)) continue;
        seen.add(element);
        numbers.observe(element);
      }
    };

    scan();
    const changes = new MutationObserver(scan);
    changes.observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });
    return () => { changes.disconnect(); reveals.disconnect(); numbers.disconnect(); };
  }, [pathname]);

  return null;
}
