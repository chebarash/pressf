"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { payRespect, rateTeacher } from "@/lib/actions";
import { CRITERIA } from "@/lib/criteria";

type Course = { code: string; subject: string };

export function RateButton({ teacherId, name, courses, signedIn, label }: { teacherId: string; name: string; courses: Course[]; signedIn: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const [course, setCourse] = useState(courses[0]?.code ?? "");
  const [values, setValues] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const complete = CRITERIA.every(([key]) => values[key]);

  const pick = (key: string, n: number) => {
    setValues((v) => ({ ...v, [key]: n }));
    setTimeout(() => setStep((s) => Math.min(s + 1, CRITERIA.length - 1)), 120);
  };

  useEffect(() => {
    if (!open || done) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (/^[1-5]$/.test(event.key)) pick(CRITERIA[step][0], Number(event.key));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, done, step]);

  const submit = () => start(async () => {
    const result = await rateTeacher({ teacherId, courseCode: course, ...values });
    if ("ok" in result) setDone(true);
  });

  return (
    <>
      <button className="key btn primary" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="scrim sheet" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="panel pad" role="dialog" aria-modal="true" aria-label={`Rate ${name}`}>
            {!signedIn ? (
              <div className="stack" style={{ justifyItems: "center", textAlign: "center" }}>
                <h2 className="d-sm">Sign in to pay respects</h2>
                <p className="soft">Use your NUU student Google account. Other students never see who rated.</p>
                <Link className="key btn" href="/sign-in">Continue with Google</Link>
                <p className="small soft">Only @newuu.uz accounts can sign in.</p>
              </div>
            ) : done ? (
              <div className="stack" style={{ justifyItems: "center", textAlign: "center" }}>
                <span className="key cap lg on" aria-hidden="true">F</span>
                <h2 className="d-md">Respects paid</h2>
                <p className="soft">Your rating of {name} is in.</p>
                <button className="key btn primary" onClick={() => { setOpen(false); setDone(false); }}>Back to profile</button>
              </div>
            ) : (
              <>
                <div><h2 className="d-sm">Rate {name}</h2><p className="small soft">Other students never see who rated. You can update it later.</p></div>
                {courses.length > 0 && (
                  <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
                    <span className="label">Which course did you take?</span>
                    <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
                      {courses.map((c) => <button key={c.code} className={`chip ${course === c.code ? "on" : ""}`} onClick={() => setCourse(c.code)}>{c.subject}</button>)}
                    </div>
                  </div>
                )}
                {CRITERIA.map(([key, title, hint], index) => (
                  <div key={key} className="row between" style={{ opacity: index > step && !values[key] ? .6 : 1 }}>
                    <div><div className="label">{title}</div><div className="small soft">{hint}</div></div>
                    <div className="row" style={{ "--gap": "6px" } as React.CSSProperties}>
                      {[1, 2, 3, 4, 5].map((n) => <button key={n} className={`key cap sm ${values[key] === n ? "on" : ""}`} onClick={() => { setStep(index); pick(key, n); }} aria-label={`${title} ${n}`}>{n}</button>)}
                    </div>
                  </div>
                ))}
                <button className="key btn primary" disabled={!complete || !course || pending} onClick={submit}>Pay respects</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function RespectButton({ teacherId, count, signedIn }: { teacherId: string; count: number; signedIn: boolean }) {
  const [shown, setShown] = useState(count);
  const [paid, setPaid] = useState(false);
  const router = useRouter();
  const press = () => {
    if (!signedIn) { router.push("/sign-in"); return; }
    if (paid) return;
    setPaid(true);
    setShown((n) => n + 1);
    payRespect(teacherId);
  };
  return (
    <div className="row" style={{ "--gap": "12px" } as React.CSSProperties}>
      <button className={`key cap ${paid ? "on" : ""}`} onClick={press} aria-label="Pay respect">F</button>
      <div><div className="d-xs num">{shown}</div><div className="small soft">respects paid</div></div>
    </div>
  );
}
