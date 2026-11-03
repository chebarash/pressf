"use client";

import { useState } from "react";
import { BottomButtons, Button, FileRow, Sheet, Tag, TextField, Toast, ToastViewport } from "@/ui/components";

/** Interactive demos: sheet, dialog and a toast. */
export function Demos() {
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [toast, setToast] = useState(false);
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <Button variant="secondary" label="Open sheet" onClick={() => setSheet(true)} />
      <Button variant="secondary" label="Open dialog" onClick={() => setDialog(true)} />
      <Button
        variant="secondary"
        label="Show toast"
        onClick={() => {
          setToast(true);
          setTimeout(() => setToast(false), 3000);
        }}
      />
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Calculus 1"
        footer={<BottomButtons secondary={{ label: "Later", onClick: () => setSheet(false) }} main={{ label: "Open Calculus 1", onClick: () => setSheet(false) }} />}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <Tag tone="accent">MATH111</Tag>
          <Tag tone="accent">Lecture 15</Tag>
        </div>
        <FileRow title="Lecture 15 slides" type="lecture" date="2 Nov" source={{ label: "LMS", kind: "lms" }} href="#" />
        <FileRow title="Practice problems" type="practice" date="2 Nov" source={{ label: "LMS", kind: "lms" }} href="#" />
      </Sheet>
      <Sheet open={dialog} onClose={() => setDialog(false)} title="Sign in with LMS" variant="dialog" footer={<Button label="Sign in" onClick={() => setDialog(false)} />}>
        <TextField label="Email" type="email" defaultValue="s.student@newuu.uz" />
        <TextField label="Password" type="password" defaultValue="secretpass" error="Wrong email or password. Use the ones from hero.study." />
      </Sheet>
      {toast ? (
        <ToastViewport>
          <Toast>Rating sent. Thanks — it&apos;s anonymous.</Toast>
        </ToastViewport>
      ) : null}
    </div>
  );
}
