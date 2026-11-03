"use client";

import { useState, useTransition } from "react";
import { moreMentions } from "@/app/(app)/anonymous/actions";
import { MentionCard as DesktopCard } from "@/screens/desktop/parts";
import { MentionCard as MobileCard } from "@/screens/mobile/parts/CourseParts";
import type { MentionView } from "@/server/views/shared";

const TZ = "Asia/Tashkent";
const postDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: TZ }) : "");

/**
 * "Show more" under an Anonymous list: loads the next posts in place, drawn as
 * the screen's own cards (desktop or mobile).
 */
export function MoreMentions({ kind, target, shown, total, variant, tag, className }: { kind: "course" | "teacher"; target: string; shown: number; total: number; variant: "desktop" | "mobile"; tag: string; className?: string }) {
  const [extra, setExtra] = useState<MentionView[]>([]);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const loaded = shown + extra.length;
  const left = Math.max(0, total - loaded);
  return (
    <>
      {extra.map((m) =>
        variant === "desktop" ? <DesktopCard key={m.id} m={{ date: postDate(m.date), text: m.text, tag, href: m.url }} /> : <MobileCard key={m.id} m={m} tag={tag} />,
      )}
      {left > 0 && !done ? (
        <button
          type="button"
          className={className}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const next = await moreMentions(kind, target, loaded);
              if (!next.length) setDone(true);
              setExtra((xs) => [...xs, ...next.filter((n) => !xs.some((x) => x.id === n.id))]);
            })
          }
        >
          {pending ? "Loading…" : `Show more · ${left} left`}
        </button>
      ) : null}
    </>
  );
}
