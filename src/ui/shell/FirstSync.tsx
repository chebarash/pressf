"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SyncStep } from "@/app/(auth)/setup/sync/route";
import { usePlatform } from "@/platform/hooks";
import { requestWriteAccess } from "@/platform/native";
import { Icon } from "./icons";
import { AlertsSheet } from "./prompts";

const STEPS: { step: SyncStep; label: string }[] = [
  { step: "profile", label: "Profile and program" },
  { step: "courses", label: "Courses this semester" },
  { step: "timetable", label: "Timetable" },
  { step: "grades", label: "Grades" },
  { step: "files", label: "Course files" },
];

type State = "waiting" | "running" | "done" | "failed";

/** 1.7 First sync, then 1.8 (alerts in Telegram) inside the Mini App. `preview` (dev only) shows fixed states without syncing. */
export function FirstSync({ next, preview }: { next: string; preview?: { states: Record<SyncStep, State>; askAlerts?: boolean } }) {
  const router = useRouter();
  const { telegram } = usePlatform();
  const [states, setStates] = useState<Record<SyncStep, State>>(preview?.states ?? { profile: "running", courses: "running", timetable: "running", grades: "waiting", files: "waiting" });
  const [askAlerts, setAskAlerts] = useState(preview?.askAlerts ?? false);
  const [asking, setAsking] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || preview) return;
    started.current = true;
    const finish = () => (telegram ? setAskAlerts(true) : router.replace(next));
    (async () => {
      try {
        const res = await fetch("/setup/sync", { method: "POST" });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const { step, ok } = JSON.parse(line) as { step: SyncStep; ok: boolean };
            setStates((s) => {
              const nextState = { ...s, [step]: ok ? "done" : "failed" } as Record<SyncStep, State>;
              if (step === "profile") nextState.grades = "running";
              if (["profile", "courses", "timetable"].every((k) => nextState[k as SyncStep] !== "running") && nextState.files === "waiting") nextState.files = "running";
              return nextState;
            });
          }
        }
      } catch {
        // Pages fall back to loading the snapshot on first visit.
      }
      setTimeout(finish, 400);
    })();
  }, [next, router, telegram, preview]);

  const allow = async () => {
    setAsking(true);
    await requestWriteAccess();
    router.replace(next);
  };

  return (
    <div className="sh-setup">
      <h1 className="t-mobile-title">Setting up</h1>
      <p className="sh-setup__text">Pulling your semester from LMS. Only the first time — after this everything opens instantly.</p>
      <ol className="sh-steps" aria-live="polite">
        {STEPS.map(({ step, label }) => (
          <li key={step} data-state={states[step]}>
            {states[step] === "done" && <Icon name="check" size={20} />}
            {states[step] === "failed" && <Icon name="x" size={20} />}
            {states[step] === "running" && <span className="sh-spinner sh-step-run" aria-hidden="true" />}
            {states[step] === "waiting" && <span className="sh-step-wait" aria-hidden="true" />}
            <span>{label}</span>
            <span className="sh-sr">{states[step] === "done" ? "done" : states[step] === "failed" ? "not available" : states[step] === "running" ? "loading" : "waiting"}</span>
          </li>
        ))}
      </ol>
      {askAlerts && <AlertsSheet busy={asking} onAllow={() => void allow()} onSkip={() => router.replace(next)} />}
    </div>
  );
}
