"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { canSubmit, COURSE_TAGS, difficultyWord, MAX_TAGS, TEACHER_TAGS, type CourseTag, type Recommend, type TeacherTag } from "@/core/ratings";
import { sendRating } from "@/app/(app)/rate/actions";
import { cx, Face, Toast } from "@/ui/components";
import { Sheet } from "@/ui/shell/overlays";
import { CheckIcon, XIcon } from "@/ui/icons";
import { HOUR_BLOCKS, hoursText, initialForm, teacherKey, toggle, toInput, type FormState } from "../rate-form";
import { MainButton } from "./MainButton";
import s from "./Rate.module.css";
import type { RateItem, RateScreen } from "../views";

const RECOMMEND: Array<{ value: Recommend; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "unsure", label: "Not sure" },
  { value: "no", label: "No" },
];

const itemKey = (i: RateItem) => `${i.courseId}|${i.term}`;

// Sticker order as laid out in Figma 4.11 (the stored values stay as in core/ratings).
const COURSE_ORDER: readonly CourseTag[] = ["Exam follows lectures", "Useful later", "Heavy reading", "Lots of group work", "Strict attendance", "Fair exams"];
const TEACHER_ORDER: readonly TeacherTag[] = ["Explains clearly", "Answers questions", "Grades fairly", "Quick feedback", "Reads from slides", "Strict about attendance"];
const inOrder = <T extends string>(all: readonly T[], order: readonly T[]) => [...order.filter((t) => all.includes(t)), ...all.filter((t) => !order.includes(t))];

const TINTS = [s.tintTeal, s.tintMustard, s.tintPlum];
// Figma 4.11/4.12: a sticker's tint and tilt follow its place in the list (teal -2°, mustard 2°, plum -1.5°).
const TILTS = [s.tiltA, s.tiltB, s.tiltC];

/**
 * The rating sheet (Figma 4.11 / 4.12 / 4.19 / 4.20). Only "Would you recommend
 * it?" is required; the MainButton stays disabled until it is answered. In the
 * queue, "Next course" moves on at once and the save confirms in the background.
 */
export function RateSheet({ open, queue }: { open: NonNullable<RateScreen["open"]>; queue: RateItem[] }) {
  const router = useRouter();
  const { mode, returnHref } = open;
  // The queue advances locally (instant); each save confirms in the background.
  const [item, setItem] = useState<RateItem>(open.item);
  const kept = useRef(new Map<string, FormState>());
  const [form, setForm] = useState<FormState>(() => initialForm(open.item, open.draft));
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const input = toInput(item, form);
  const ready = canSubmit(input);

  const index = queue.findIndex((q) => q.courseId === item.courseId && q.term === item.term);
  const next = mode === "queue" && index !== -1 ? queue[index + 1] ?? null : null;
  const close = useCallback(() => router.replace(returnHref, { scroll: false }), [router, returnHref]);

  const show = (to: RateItem, f: FormState) => {
    setItem(to);
    setForm(f);
    window.history.replaceState(window.history.state, "", to.href);
  };

  const send = () => {
    if (!ready) return;
    setError(false);
    const rated = item;
    const answers = input;
    if (next) {
      // Optimistic: show the next course now; if this save fails, come back with the answers kept.
      kept.current.set(itemKey(rated), form);
      show(next, kept.current.get(itemKey(next)) ?? initialForm(next, null));
      start(async () => {
        const res = await sendRating(rated.courseId, rated.term, answers).catch(() => ({ ok: false as const, reason: "failed" as const }));
        if (res.ok) return void router.refresh();
        if (res.reason === "sign-in") return void router.push(`/sign-in?next=${encodeURIComponent(rated.href)}`);
        show(rated, kept.current.get(itemKey(rated))!);
        setError(true);
      });
      return;
    }
    start(async () => {
      const res = await sendRating(rated.courseId, rated.term, answers).catch(() => ({ ok: false as const, reason: "failed" as const }));
      const back = mode === "queue" ? "/rate" : returnHref;
      if (res.ok) router.replace(`${back}${back.includes("?") ? "&" : "?"}sent=1`, { scroll: false });
      else if (res.reason === "sign-in") router.push(`/sign-in?next=${encodeURIComponent(rated.href)}`);
      else setError(true);
    });
  };

  const skip = () => (next ? show(next, kept.current.get(itemKey(next)) ?? initialForm(next, null)) : close());

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTeacher = (key: string, patch: Partial<FormState["teachers"][string]>) => setForm((f) => ({ ...f, teachers: { ...f.teachers, [key]: { ...f.teachers[key], ...patch } } }));
  const position = mode === "queue" && index !== -1 ? ` · ${index + 1} of ${queue.length}` : "";

  const footer = (
    <>
      {error ? (
        <Toast tone="error" icon={<XIcon size={18} />} className={s.error}>
          Couldn&apos;t send — no connection. Your answers are kept.
        </Toast>
      ) : null}
      {error ? (
        <MainButton text="Try again" onClick={send} loading={pending} />
      ) : mode === "queue" ? (
        <MainButton text={next ? "Next course" : "Send rating"} onClick={send} disabled={!ready} loading={pending} secondary={{ text: "Skip", onClick: skip }} />
      ) : (
        <MainButton text="Send rating" onClick={send} disabled={!ready} loading={pending} />
      )}
    </>
  );

  // Drag across the hour blocks: the pointer is captured by the row, the block comes from x.
  const blockAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(1, Math.min(HOUR_BLOCKS, Math.ceil(((e.clientX - r.left) / r.width) * HOUR_BLOCKS)));
  };

  return (
    <>
      <Sheet label={`Rate ${item.name}`} onClose={close} className={s.sheet}>
        <h2 className="sh-sheet__title">Rate {item.name}</h2>
        <p className={s.sub}>
          {item.term}
          {position} · anonymous · about 30 seconds
        </p>

        <div className={s.q} role="group" aria-labelledby="rq-recommend">
          <p id="rq-recommend" className={s.qTitle}>Would you recommend it?</p>
          <div className={s.recommend}>
            {RECOMMEND.map((r) => (
              <button key={r.value} type="button" className={cx(s.option, form.recommend === r.value && s.optionOn)} aria-pressed={form.recommend === r.value} onClick={() => set("recommend", r.value)}>
                {r.value === "yes" ? <CheckIcon size={28} /> : r.value === "no" ? <XIcon size={28} /> : <span className={s.qMark}>?</span>}
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className={s.q} role="group" aria-labelledby="rq-hours">
          <p id="rq-hours" className={s.qTitle}>Hours a week outside class</p>
          <div className={s.hoursBox}>
          <div
            className={s.blocks}
            role="radiogroup"
            aria-label="Hours a week"
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1 || e.currentTarget.hasPointerCapture(e.pointerId)) set("blocks", blockAt(e));
            }}
          >
            {Array.from({ length: HOUR_BLOCKS }, (_, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={form.blocks === i + 1}
                aria-label={i + 1 === HOUR_BLOCKS ? "12 or more hours" : `${i + 1} hours`}
                className={cx(s.block, i < form.blocks && s.blockOn)}
                onClick={() => set("blocks", form.blocks === i + 1 ? 0 : i + 1)}
              />
            ))}
          </div>
          <div className={s.blocksFoot}>
            <span className={s.hours}>{form.blocks ? hoursText(form.blocks) : "Tap a block"}</span>
            <span className={s.hint}>drag or tap · 12+ = the last block</span>
          </div>
          </div>
        </div>

        <div className={s.q} role="group" aria-labelledby="rq-hard">
          <p id="rq-hard" className={s.qTitle}>How hard was it?</p>
          <div className={s.hard}>
            <div className={s.steps} role="radiogroup" aria-label="Difficulty">
              {([1, 2, 3, 4, 5] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={form.difficulty === d}
                  aria-label={`${d} of 5, ${difficultyWord(d)}`}
                  className={cx(s.step, form.difficulty !== null && d <= form.difficulty && (d <= 2 ? s.stepLight : s.stepOn))}
                  style={{ height: 6 + d * 10 }}
                  onClick={() => set("difficulty", form.difficulty === d ? null : d)}
                />
              ))}
            </div>
            {form.difficulty ? (
              <span className={s.hardText}>
                <span className={s.hardWord}>{difficultyWord(form.difficulty)}</span>
                <span className={s.hardOf}>{form.difficulty} of 5</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className={s.q} role="group" aria-labelledby="rq-tags">
          <p id="rq-tags" className={s.qTitle}>Stick up to {MAX_TAGS}</p>
          <Stickers all={inOrder(COURSE_TAGS, COURSE_ORDER)} picked={form.tags} onToggle={(t) => set("tags", toggle(form.tags, t))} />
        </div>

        {item.teachers.length ? (
          <section className={s.teachers}>
            <hr className={s.divider} />
            <h3 className={s.qTitle}>Your teachers</h3>
            <p className={s.teachersHint}>Only the ones who taught your group — from your LMS stream.</p>
            {item.teachers.map((t) => {
              const key = teacherKey(t);
              const a = form.teachers[key] ?? { pressF: null, tags: [] };
              return <TeacherRow key={key} name={t.name} face={t.face ?? null} roleLabel={t.roleLabel} pressF={a.pressF} tags={a.tags} onPress={() => setTeacher(key, { pressF: a.pressF ? null : true })} onTag={(tag) => setTeacher(key, { tags: toggle(a.tags, tag) })} />;
            })}
          </section>
        ) : null}
        {footer}
      </Sheet>
    </>
  );
}

function Stickers<T extends string>({ all, picked, onToggle }: { all: readonly T[]; picked: T[]; onToggle: (t: T) => void }) {
  const full = picked.length >= MAX_TAGS;
  return (
    <div className={s.stickers}>
      {all.map((t, i) => {
        const on = picked.includes(t);
        return (
          <button key={t} type="button" className={cx(s.sticker, on ? cx(s.stickerOn, TINTS[i % TINTS.length], TILTS[i % TILTS.length]) : s.stickerOff)} aria-pressed={on} disabled={!on && full} onClick={() => onToggle(t)}>
            {on ? "✓" : "+"} {t}
          </button>
        );
      })}
    </div>
  );
}

function TeacherRow({ name, face, roleLabel, pressF, tags, onPress, onTag }: { name: string; face: string | null; roleLabel: string; pressF: boolean | null; tags: (typeof TEACHER_TAGS)[number][]; onPress: () => void; onTag: (t: (typeof TEACHER_TAGS)[number]) => void }) {
  const [more, setMore] = useState(false);
  // Figma 4.12: stickers open on "+ stickers" (or once one is stuck) and the card lifts; F alone keeps it flat.
  const expanded = more || tags.length > 0;
  return (
    <div className={cx(s.teacher, expanded && s.teacherOn)}>
      <div className={s.teacherTop}>
        <Face src={face} size={40} />
        <span className={s.teacherText}>
          <span className={s.teacherName}>{name}</span>
          <span className={cx(s.teacherSub, pressF && s.teacherSubOn)}>{pressF ? `${roleLabel} · pressed F` : `${roleLabel} · press F if you'd take them again`}</span>
        </span>
        {/* Keycap S (Figma 4007:1101): the cap sits 5 px up on its shadow; pressed, it drops into the slot. */}
        <button type="button" className={cx(s.keyF, pressF && s.keyFOn)} aria-pressed={!!pressF} aria-label={`Press F for ${name}`} onClick={onPress}>
          <span className={s.keyCap}>F</span>
        </button>
      </div>
      {expanded ? (
        <Stickers all={inOrder(TEACHER_TAGS, TEACHER_ORDER)} picked={tags} onToggle={onTag} />
      ) : (
        <button type="button" className={s.more} onClick={() => setMore(true)}>
          + stickers
        </button>
      )}
    </div>
  );
}
