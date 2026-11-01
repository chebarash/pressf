"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { payRespect, rateTeacher } from "@/lib/actions";
import { CRITERIA } from "@/lib/criteria";
import { Face } from "./ui";

export type RateOption = { teacherId: string; courseCode: string; label: string; face?: string | null; given?: Partial<Record<(typeof CRITERIA)[number][0], number>> };

/**
 * One rating belongs to a teacher and a course. A professor page offers their
 * courses and a course page offers its teachers; a single option skips the choice.
 */
export function RateButton({ title, subtitle, pick, options, signedIn, label }: { title: string; subtitle?: string; pick: string; options: RateOption[]; signedIn: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const [option, setOption] = useState(options.find((item) => !item.given) ?? options[0]);
  const [values, setValues] = useState<Record<string, number>>(option?.given ?? {});
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const form = useRef<HTMLDivElement>(null);
  const complete = CRITERIA.every(([key]) => values[key]);

  const choose = (next: RateOption) => {
    setOption(next);
    setValues(next.given ?? {});
    setStep(0);
  };

  const pick1to5 = (index: number, n: number) => {
    setValues((v) => ({ ...v, [CRITERIA[index][0]]: n }));
    setStep(index);
    setTimeout(() => {
      const next = Math.min(index + 1, CRITERIA.length - 1);
      setStep(next);
      form.current?.querySelector<HTMLButtonElement>(`[data-criterion="${next}"]`)?.focus();
    }, 120);
  };

  useEffect(() => {
    if (!open || done) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (/^[1-5]$/.test(event.key)) pick1to5(step, Number(event.key));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, done, step]);

  const submit = () => start(async () => {
    const result = await rateTeacher({ teacherId: option.teacherId, courseCode: option.courseCode, ...values });
    if ("ok" in result) setDone(true);
  });

  if (!options.length) return <span className="small soft">Not in the timetable this term</span>;
  return (
    <>
      <button className="key btn primary" onClick={() => setOpen(true)}>{label}</button>
      {open && createPortal(
        <div className="scrim sheet" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div ref={form} className="panel pad" role="dialog" aria-modal="true" aria-label={title}>
            {!signedIn ? (
              <div className="stack" style={{ justifyItems: "center", textAlign: "center" }}>
                <h2 className="d-sm">Sign in to pay respects</h2>
                <p className="soft">Use your NewUU student Google account. Other students never see who rated.</p>
                <Link className="key btn" href="/sign-in">Continue with Google</Link>
                <p className="small soft">Only @newuu.uz accounts can sign in.</p>
              </div>
            ) : done ? (
              <div className="stack" style={{ justifyItems: "center", textAlign: "center" }}>
                <span className="key cap lg on" aria-hidden="true">F</span>
                <h2 className="d-md">Respects paid</h2>
                <p className="soft">Your rating for {option.label} is in.</p>
                <button className="key btn primary" onClick={() => { setOpen(false); setDone(false); }}>Back</button>
              </div>
            ) : (
              <>
                <div><h2 className="d-sm">{title}</h2><p className="small soft">{option.given ? "You rated this course. Change anything and save." : subtitle ?? "Other students never see who rated. You can update it later."}</p></div>
                {options.length > 1 && (
                  <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
                    <span className="label">{pick}</span>
                    <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
                      {options.map((item) => (
                        <button key={`${item.teacherId}${item.courseCode}`} className={`chip ${item === option ? "on" : ""}`} onClick={() => choose(item)}>
                          {item.face !== undefined && <Face name="" src={item.face} size={24} />}
                          {item.label}
                          {item.given && <span aria-label="rated">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {CRITERIA.map(([key, criterion, hint], index) => (
                  <div key={key} className={`row between rate-row ${index === step ? "current" : ""}`} style={{ opacity: index > step && !values[key] ? .6 : 1 }}>
                    <div><div className="label">{criterion}</div><div className="small soft">{hint}</div></div>
                    <div className="row" style={{ "--gap": "6px" } as React.CSSProperties}>
                      {[1, 2, 3, 4, 5].map((n) => <button key={n} data-criterion={index} className={`key cap sm ${values[key] === n ? "on" : ""}`} onClick={() => pick1to5(index, n)} aria-label={`${criterion} ${n}`}>{n}</button>)}
                    </div>
                  </div>
                ))}
                <button className="key btn primary" disabled={!complete || pending} onClick={submit}>{option.given ? "Update rating" : "Pay respects"}</button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function RespectButton({ teacherId, count, signedIn }: { teacherId: string; count: number; signedIn: boolean }) {
  const [shown, setShown] = useState(count);
  const [paid, setPaid] = useState(false);
  const [rolling, setRolling] = useState(false);
  const router = useRouter();
  const press = () => {
    if (!signedIn) { router.push("/sign-in"); return; }
    if (paid) return;
    setPaid(true);
    setShown((n) => n + 1);
    setRolling(true);
    payRespect(teacherId);
  };
  return (
    <div className="row" style={{ "--gap": "12px" } as React.CSSProperties}>
      <span className="respect">
        <button className={`key cap ${paid ? "on" : ""}`} onClick={press} aria-label="Pay respect">F</button>
        {paid && <span className="fly" aria-hidden="true">F</span>}
      </span>
      <div>
        <div className="d-xs num roll"><span className={rolling ? "rolling" : ""} onAnimationEnd={() => setRolling(false)}>{rolling && <span>{shown - 1}</span>}<span>{shown}</span></span></div>
        <div className="small soft">respects paid</div>
      </div>
    </div>
  );
}
