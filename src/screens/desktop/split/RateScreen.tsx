"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { HOURS, MAX_TAGS, type CourseTag, type Hours, type RatingInput, type Recommend, type TeacherTag } from "@/core/ratings";
import { EmptyState, Sheet } from "@/ui/components";
import type { RateData } from "../model";
import { Button, cx, Face, Hint } from "../parts";
import r from "../rate.module.css";

export type RateActions = { submit?: (courseId: string, input: RatingInput) => Promise<void> };

const RECOMMEND: Array<{ id: Recommend; label: string; key: string }> = [
  { id: "yes", label: "Yes", key: "Y" },
  { id: "unsure", label: "Not sure", key: "?" },
  { id: "no", label: "No", key: "N" },
];
const HOURS_LABEL: Record<Hours, string> = { "0-2": "< 2", "2-4": "2–4", "4-6": "4–6", "6-10": "6–10", "10+": "10+" };
const HARD = ["Easy", "2", "3", "Hard", "Brutal"];

/**
 * D5 Rate dialog — everything from the keyboard: Y ? N, Tab between questions,
 * digits pick the answer, F1–F3 press F for a teacher, ⌘↵ sends, Esc closes.
 */
export function RateScreen({ data, actions }: { data: RateData; actions?: RateActions }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState(0);
  const [recommend, setRecommend] = useState<Recommend | null>(data.initial?.recommend ?? null);
  const [hours, setHours] = useState<Hours | null>((data.initial?.hours as Hours | null) ?? null);
  const [difficulty, setDifficulty] = useState<RatingInput["difficulty"]>((data.initial?.difficulty as RatingInput["difficulty"]) ?? null);
  const [tags, setTags] = useState<string[]>(data.initial?.tags ?? []);
  const [pressed, setPressed] = useState<string[]>(data.initial?.pressed ?? []);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const close = () => {
    setOpen(false);
    if (window.history.length > 1) router.back();
    else router.push("/");
  };
  const toggleTag = (t: string) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : xs.length >= MAX_TAGS ? xs : [...xs, t]));
  const togglePress = (id: string) => setPressed((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const send = () => {
    if (!data.course || !recommend || pending) return;
    const input: RatingInput = {
      recommend,
      hours,
      difficulty,
      tags: tags as CourseTag[],
      teachers: data.teachers.map((t) => ({ teacherId: t.id, role: t.kind, pressF: pressed.includes(t.id), tags: (data.initial?.teacherTags?.[`${t.id}|${t.kind}`] ?? []) as TeacherTag[] })),
    };
    start(async () => {
      await actions?.submit?.(data.course!.id, input);
      setSent(true);
    });
  };

  useEffect(() => {
    if (!open || sent) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        send();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const f = /^F([1-9])$/.exec(e.key);
      if (f) {
        const t = data.teachers[Number(f[1]) - 1];
        if (t) {
          e.preventDefault();
          togglePress(t.id);
        }
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        setQ((x) => (x + (e.shiftKey ? 2 : 1)) % 3);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "y" || k === "n" || k === "?") {
        setRecommend(k === "y" ? "yes" : k === "n" ? "no" : "unsure");
        setQ(1);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 5) {
        if (q === 2) setDifficulty(n as RatingInput["difficulty"]);
        else {
          setHours(HOURS[n - 1]);
          setQ(2);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Sheet open={open} onClose={close} title={data.course ? `Rate ${data.course.name}` : "Rate"} heading={false} variant="dialog" className={r.dialog}>
      <div className={r.body} data-keyboard-scope>
        {!data.course ? (
          <EmptyState title="Nothing to rate" text="You've rated every course you took. Thank you — next year's students choose by this." />
        ) : sent ? (
          <div className={r.done}>
            <h2 className={r.title}>Sent. Thank you.</h2>
            <p className={r.sub}>{data.waiting > 1 ? `${data.waiting - 1} more to rate.` : "That was the last one."}</p>
            <Button onClick={() => (data.waiting > 1 ? router.refresh() : close())}>{data.waiting > 1 ? "Next course" : "Done"}</Button>
          </div>
        ) : (
          <>
            <div className={r.head}>
              <h2 className={r.title}>Rate {data.course.name}</h2>
              <Hint>Esc</Hint>
            </div>
            <p className={r.sub}>{data.course.term} · anonymous · about 30 seconds · everything works from the keyboard</p>

            <div className={cx(r.q, q === 0 && r.qOn)} onFocus={() => setQ(0)}>
              <span className={r.qLabel}>Would you recommend it?</span>
              <div className={r.opts} role="radiogroup" aria-label="Would you recommend it?">
                {RECOMMEND.map((o) => (
                  <button key={o.id} type="button" role="radio" aria-checked={recommend === o.id} className={cx(r.opt, recommend === o.id && r.optOn)} onClick={() => setRecommend(o.id)}>
                    {o.label} <kbd>{o.key}</kbd>
                  </button>
                ))}
              </div>
            </div>
            <div className={cx(r.q, q === 1 && r.qOn)} onFocus={() => setQ(1)}>
              <span className={r.qLabel}>Hours a week outside class</span>
              <div className={r.opts} role="radiogroup" aria-label="Hours a week outside class">
                {HOURS.map((h, i) => (
                  <button key={h} type="button" role="radio" aria-checked={hours === h} className={cx(r.opt, hours === h && r.optOn)} onClick={() => setHours(h)}>
                    {HOURS_LABEL[h]} <kbd>{i + 1}</kbd>
                  </button>
                ))}
              </div>
            </div>
            <div className={cx(r.q, q === 2 && r.qOn)} onFocus={() => setQ(2)}>
              <span className={r.qLabel}>How hard was it?</span>
              <div className={r.opts} role="radiogroup" aria-label="How hard was it?">
                {HARD.map((h, i) => (
                  <button key={h} type="button" role="radio" aria-checked={difficulty === i + 1} className={cx(r.opt, r.optHard, difficulty === i + 1 && r.optOn)} onClick={() => setDifficulty((i + 1) as RatingInput["difficulty"])}>
                    {h} <kbd>{i + 1}</kbd>
                  </button>
                ))}
              </div>
            </div>

            <div className={r.tags}>
              {data.tags.map((t) => (
                <button key={t} type="button" aria-pressed={tags.includes(t)} className={cx(r.tag, tags.includes(t) && r.tagOn)} onClick={() => toggleTag(t)}>
                  {tags.includes(t) ? "✓" : "+"} {t}
                </button>
              ))}
            </div>

            {data.teachers.length > 0 && (
              <>
                <p className={r.teachersTitle}>Your teachers — press F if you&apos;d take a class with them again</p>
                <div className={r.teachers}>
                  {data.teachers.map((t, i) => {
                    const on = pressed.includes(t.id);
                    return (
                      <button key={t.id} type="button" aria-pressed={on} className={cx(r.teacher, on && r.teacherOn)} onClick={() => togglePress(t.id)}>
                        <Face src={t.face} size={40} />
                        <b>{t.name}</b>
                        <span>{t.role}</span>
                        <span className={r.fKey}>F</span>
                        <small>{on ? `Pressed · F${i + 1}` : `Press F${i + 1}`}</small>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className={r.foot}>
              <p>Tab moves between questions · digits answer · F1–F{Math.max(1, data.teachers.length)} press F</p>
              <Button onClick={send} disabled={!recommend || pending} loading={pending}>
                Send rating
              </Button>
              <Hint>⌘↵</Hint>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
