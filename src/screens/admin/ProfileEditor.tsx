"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetProfile, saveProfile, type Result } from "@/app/admin/actions";
import { LIMITS, PROFILE_FIELDS, type ProfileFields } from "@/core/faculty";
import type { profileDetail } from "@/server/admin/profiles";
import { Btn, Chip, Label, cx, s } from "./ui";
import { useKeys } from "./useKeys";

export type ProfileDetail = NonNullable<Awaited<ReturnType<typeof profileDetail>>>;

const LABEL: Record<keyof ProfileFields, string> = {
  name: "Display name", position: "Position", department: "Department", school: "School", office: "Office", email: "Email", hours: "Office hours", note: "Note",
};
const PLACEHOLDER: Partial<Record<keyof ProfileFields, string>> = {
  office: "115", email: "a.roy@newuu.uz", hours: "Tue, Thu 14:00–15:30", note: "Shown on the page, e.g. On leave in Spring 2027",
};

const blank = (o: ProfileFields | null) => Object.fromEntries(PROFILE_FIELDS.map((k) => [k, o?.[k] ?? ""])) as Record<keyof ProfileFields, string>;

/**
 * A6 Professors · Profile: LMS, imported (newuu.uz) and admin values side by side.
 * An admin value wins everywhere and survives every harvest; empty = use the imported/LMS value.
 * `canEdit` false (not admin) shows the values read-only.
 */
export function ProfileEditor({ data, canEdit = true }: { data: ProfileDetail; canEdit?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState(() => blank(data.override));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = PROFILE_FIELDS.some((k) => form[k].trim() !== (data.override?.[k] ?? ""));

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      setNote(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
      router.refresh();
    });
  const save = () => canEdit && dirty && !pending && run(() => saveProfile(data.id, form));
  const reset = () => {
    if (!canEdit || pending) return;
    setForm(blank(null));
    run(() => resetProfile(data.id));
  };
  useKeys({ "mod+Enter": save });

  const fallback = (k: keyof ProfileFields) => (k === "name" ? data.lms.name : data.imported?.[k] ?? data.lms[k]) ?? "";

  return (
    <section className={cx(s.detail)} aria-label="Profile" style={{ gap: 16 }}>
      <div className={s.hstack} style={{ gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <h2 className={s.h2}>{data.shown.name ?? data.lms.name}</h2>
          <div className={s.note}>
            LMS {data.id}
            {data.site ? ` · newuu.uz #${data.site.siteId} (${data.site.match === "manual" ? "linked by hand" : "matched by name"}, ${new Date(data.site.fetchedAt).toLocaleDateString("en-GB")})` : " · not on newuu.uz yet"}
          </div>
        </div>
        {data.override && <Chip tone="mustard">EDITED</Chip>}
      </div>

      <div className={s.cardSoft} style={{ gap: 0, padding: 0 }}>
        <div className={cx(s.tr, s.trHead)}>
          <span className={s.td} style={{ width: 120 }}>FIELD</span>
          <span className={s.td} style={{ width: 150 }}>LMS</span>
          <span className={s.td} style={{ width: 170 }}>NEWUU.UZ</span>
          <span className={cx(s.td, s.tdGrow)}>OVERRIDE (WINS)</span>
        </div>
        {PROFILE_FIELDS.map((k) => (
          <label key={k} className={cx(s.tr, s.trPlain)} style={{ alignItems: "center" }}>
            <span className={cx(s.td, s.tdStrong)} style={{ width: 120 }}>{LABEL[k]}</span>
            <span className={cx(s.td, s.small)} style={{ width: 150, overflowWrap: "anywhere" }}>{data.lms[k] ?? "—"}</span>
            <span className={cx(s.td, s.small)} style={{ width: 170, overflowWrap: "anywhere" }}>{data.imported?.[k] ?? "—"}</span>
            <span className={cx(s.td, s.tdGrow)}>
              {k === "note" || k === "hours" ? (
                <textarea className={s.input} rows={2} maxLength={LIMITS[k]} value={form[k]} disabled={!canEdit} placeholder={PLACEHOLDER[k] ?? fallback(k)} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={{ resize: "vertical" }} />
              ) : (
                <input className={s.input} type={k === "email" ? "email" : "text"} maxLength={LIMITS[k]} value={form[k]} disabled={!canEdit} placeholder={fallback(k) || PLACEHOLDER[k] || ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
              )}
            </span>
          </label>
        ))}
      </div>
      <p className={s.small}>Empty fields use the newuu.uz value, then the LMS. Email must be a @newuu.uz address. Names show as given name + surname.</p>

      <div className={s.cardSoft}>
        <Label>ON THE PAGE</Label>
        <span className={s.small}>{[data.shown.position, data.shown.department, data.shown.school].filter(Boolean).join(" · ") || "No position or department"}</span>
        <span className={s.small}>{[data.shown.office && `Office ${data.shown.office}`, data.shown.email, data.shown.hours].filter(Boolean).join(" · ") || "No contact details"}</span>
        {data.shown.note && <span className={s.small}>{data.shown.note}</span>}
      </div>

      {note && <div className={note.ok ? s.small : s.error}>{note.text}</div>}
      <div className={s.spacer} />
      {canEdit ? (
        <div className={s.actions}>
          <Btn tone="accent" hint="⌘↵" onClick={save} disabled={!dirty || pending}>Save</Btn>
          <Btn onClick={reset} disabled={pending || !data.override}>Reset to imported</Btn>
        </div>
      ) : (
        <p className={s.small}>Only admins can edit profiles.</p>
      )}
    </section>
  );
}
