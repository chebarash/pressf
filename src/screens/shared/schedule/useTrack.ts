"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

const noop = () => () => {};
const yes = () => true;
const no = () => false;

/**
 * An endless scroller of equal slots (days, weeks): the track is as long as
 * the whole range (twenty years) and only a window of slots is rendered, each
 * placed with a transform at `index × size`, so scrolling never moves or
 * re-lays out what is on screen and nothing has to be corrected when slots
 * come and go. `size` comes from CSS (`--size` on the scroller, measured by
 * a probe), so the server render and the first paint already have the right
 * layout: until hydration slots are placed from `start` (`base`), then the
 * scroll position takes over in the same frame.
 */
export function useTrack({ axis, start, onSettle }: { axis: "x" | "y"; start: number; /** The slot at the leading edge once scrolling stops. */ onSettle?: (index: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const size = useRef(0);
  // False for the server render and hydration, true after (and at once on a client navigation).
  const ready = useSyncExternalStore(noop, yes, no);
  // The slot at the leading edge, as an integer: renderers re-render only when it changes.
  const [lead, setLead] = useState(start);
  const settle = useRef(onSettle);
  // Where a scroll started by `scrollTo` is heading; the user taking over clears it.
  const aiming = useRef<number | null>(null);
  useEffect(() => {
    settle.current = onSettle;
  });

  const pos = useCallback((el: HTMLElement) => (axis === "x" ? el.scrollLeft : el.scrollTop), [axis]);
  const measure = useCallback(() => {
    const p = probe.current;
    if (!p) return 0;
    const r = p.getBoundingClientRect();
    return axis === "x" ? r.width : r.height;
  }, [axis]);

  // Before paint: measure and scroll to `start` (slots are already in scroll coordinates).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!ready || !el) return;
    size.current = measure();
    if (!size.current) return;
    if (axis === "x") el.scrollLeft = start * size.current;
    else el.scrollTop = start * size.current;
    // Only on the first paint: later moves go through scrollTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    let frame = 0;
    let timer = 0;
    const read = () => {
      frame = 0;
      if (size.current) setLead(Math.floor((pos(el) + 1) / size.current));
    };
    const done = () => {
      if (!size.current) return;
      const at = Math.round(pos(el) / size.current);
      // A scroll we started settles only where it was going (smooth scrolling can pause on the way).
      if (aiming.current !== null && at !== aiming.current) return;
      aiming.current = null;
      settle.current?.(at);
    };
    const user = () => {
      aiming.current = null;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
      // `scrollend` where supported; a short pause otherwise.
      window.clearTimeout(timer);
      timer = window.setTimeout(done, 160);
    };
    const onEnd = () => {
      window.clearTimeout(timer);
      done();
    };
    // A new width keeps the slot at the leading edge where it was.
    const resize = new ResizeObserver(() => {
      const keep = size.current ? pos(el) / size.current : start;
      size.current = measure();
      if (axis === "x") el.scrollLeft = keep * size.current;
      else el.scrollTop = keep * size.current;
    });
    resize.observe(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onEnd);
    el.addEventListener("wheel", user, { passive: true });
    el.addEventListener("touchstart", user, { passive: true });
    el.addEventListener("pointerdown", user, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      resize.disconnect();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onEnd);
      el.removeEventListener("wheel", user);
      el.removeEventListener("touchstart", user);
      el.removeEventListener("pointerdown", user);
    };
  }, [ready, axis, pos, measure, start]);

  /** Scrolls so `index` is at the leading edge (smoothly unless the user prefers less motion). */
  const scrollTo = useCallback(
    (index: number, smooth = true) => {
      const el = ref.current;
      if (!el || !size.current) return;
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const to = index * size.current;
      aiming.current = Math.abs(pos(el) - to) < 1 ? null : index;
      el.scrollTo({ [axis === "x" ? "left" : "top"]: to, behavior: smooth && !reduce ? "smooth" : "auto" });
    },
    [axis, pos],
  );

  /** The slot at the leading edge right now (fractional while scrolling). */
  const at = useCallback(() => (ref.current && size.current ? pos(ref.current) / size.current : lead), [pos, lead]);

  return { scrollRef: ref as RefObject<HTMLDivElement>, probeRef: probe as RefObject<HTMLDivElement>, ready, base: ready ? 0 : start, lead, scrollTo, at };
}
