"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { assignOldFace, discardOldFace, removeFace, transferFaces, uploadFace, type Result } from "@/app/admin/actions";
import type { facesPage } from "@/server/admin/faces";
import { Btn, Chip, Head, KV, Label, cx, s } from "./ui";
import { useKeys } from "./useKeys";

export type FacesData = Awaited<ReturnType<typeof facesPage>>;

const DEFAULT_FACE = "/ui/face-default.png";
const MAX_BYTES = 512 * 1024;

/** A drawn face on the page background, at a fixed size. Plain <img>: faces are tiny and cached per version. */
function FaceImg({ src, size, alt = "" }: { src: string | null; size: number; alt?: string }) {
  // Only our own paths or a local preview blob; never a URL from elsewhere.
  const safe = src && /^(\/faces\/|blob:)/.test(src) ? src : DEFAULT_FACE;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={safe} alt={alt} width={size} height={size} style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, opacity: safe === DEFAULT_FACE ? 0.35 : 1 }} />;
}

/** A6 Professors · Faces: drawn faces only (never photos). Upload, replace, remove, and re-use faces from the old catalog. */
export function ProfessorFaces({ data }: { data: FacesData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ tab: "faces", show: data.show, ...(data.q ? { q: data.q } : {}) });
    for (const [k, v] of Object.entries(patch)) v ? params.set(k, v) : params.delete(k);
    return `/admin/professors?${params}`;
  };
  useKeys({ "/": () => search.current?.focus() });

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      setNote(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
      router.refresh();
    });

  const tabs: Array<{ id: FacesData["show"]; label: string; n: number }> = [
    { id: "missing", label: "No face", n: data.counts.missing },
    { id: "with", label: "With face", n: data.counts.with },
    { id: "old", label: "Old faces", n: data.counts.old },
  ];

  return (
    <>
      <section className={cx(s.main, s.mainFixed)} style={{ width: 560 }}>
        <Head title="Professors" sub={`${data.counts.with} of ${data.total} have a drawn face`} />
        <div className={s.tabs}>
          <Link href="/admin/professors" className={s.chip}>Duplicates</Link>
          <Link href="/admin/professors?tab=all" className={s.chip}>All</Link>
          <span className={cx(s.chip, s.chipInverse)}>Faces</span>
        </div>
        <div className={s.tabs}>
          {tabs.map((t) => (
            <Link key={t.id} href={`/admin/professors?tab=faces&show=${t.id}`} className={cx(s.chip, data.show === t.id && s.chipInverse)}>
              {t.label} {t.n}
            </Link>
          ))}
        </div>
        {data.show !== "old" ? (
          <>
            <form className={s.search} action="/admin/professors">
              <input type="hidden" name="tab" value="faces" />
              <input type="hidden" name="show" value={data.show} />
              <input ref={search} name="q" defaultValue={data.q} placeholder="Professor's name" aria-label="Search professors" autoComplete="off" />
              <kbd className={s.key}>/</kbd>
            </form>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className={cx(s.tr, s.trHead)}>
                <span className={s.td} style={{ width: 32 }} />
                <span className={cx(s.td, s.tdGrow)}>NAME</span>
                <span className={s.td} style={{ width: 70 }}>COURSES</span>
              </div>
              {data.list.length === 0 && <p className={s.small}>{data.q ? `Nobody matches “${data.q}”.` : data.show === "missing" ? "Every professor has a face." : "No faces yet."}</p>}
              {data.list.map((t) => (
                <Link key={t.id} href={href({ id: t.id })} className={cx(s.tr, s.trLink, t.id === data.selected?.id && s.trSelected)} prefetch={false} scroll={false}>
                  <FaceImg src={t.face} size={32} />
                  <span className={cx(s.td, s.tdGrow, s.tdStrong)}>{t.name}</span>
                  <span className={s.td} style={{ width: 70 }}>{t.courses}</span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <OldFaces data={data} pending={pending} run={run} />
        )}
        {data.show === "old" && note && <div className={note.ok ? s.small : s.error}>{note.text}</div>}
      </section>
      {data.show !== "old" && data.selected ? <Detail key={data.selected.id} sel={data.selected} pending={pending} run={run} note={note} /> : <section className={cx(s.detail, s.detailNarrow)} />}
    </>
  );
}

function Detail({ sel, pending, run, note }: { sel: NonNullable<FacesData["selected"]>; pending: boolean; run: (fn: () => Promise<Result>) => void; note: { ok: boolean; text: string } | null }) {
  const file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<File | null>(null);

  const pick = (f: File | undefined) => {
    setError(null);
    setPicked(null);
    setPreview(null);
    if (!f) return;
    if (!/\.(png|svg)$/i.test(f.name) && !/^image\/(png|svg\+xml)$/.test(f.type)) return setError("Upload a PNG or an SVG drawing");
    if (f.size > MAX_BYTES) return setError("Faces are line drawings: keep the file under 512 KB");
    setPicked(f);
    setPreview(URL.createObjectURL(f));
  };
  const save = () => {
    if (!picked) return;
    const form = new FormData();
    form.set("teacherId", sel.id);
    form.set("file", picked);
    run(async () => {
      const r = await uploadFace(form);
      if (r.ok) {
        setPicked(null);
        setPreview(null);
        if (file.current) file.current.value = "";
      }
      return r;
    });
  };
  const shown = preview ?? sel.face;

  return (
    <section className={cx(s.detail, s.detailNarrow)} aria-label="Face">
      <h2 className={s.h2}>{sel.name}</h2>
      <div className={s.row2} style={{ gap: 12 }}>
        {/* Light and dark page backgrounds: the head must read on both. */}
        <div className={s.cardSoft} style={{ flex: "1 0 0", alignItems: "center", background: "var(--bg-page)" }}>
          <FaceImg src={shown} size={120} alt={sel.name} />
        </div>
        <div className={s.cardSoft} style={{ flex: "1 0 0", alignItems: "center", background: "var(--bg-inverse)" }}>
          <FaceImg src={shown} size={120} alt="" />
        </div>
      </div>
      {preview && <Chip tone="mustard">PREVIEW — NOT SAVED</Chip>}
      <div className={s.cardSoft}>
        <KV k="Position" wide>{sel.position ?? "—"}</KV>
        <KV k="Courses" wide>{sel.courses}</KV>
        <KV k="Face" wide>{sel.face ? `${sel.format} · ${sel.updatedAt ? new Date(sel.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}` : "None — the default face shows"}</KV>
        <KV k="Page" wide><Link href={`/p/${sel.id}`} className={s.link}>/p/{sel.id}</Link></KV>
      </div>
      <Label>DRAWN FACES ONLY</Label>
      <p className={s.small} style={{ margin: 0 }}>
        A line drawing of the head in the Press F style — never a photo, never traced from one. PNG with a transparent background or a plain SVG, about square, 96–2048 px, under 512 KB.
      </p>
      <input ref={file} type="file" accept="image/png,image/svg+xml,.png,.svg" className={s.input} onChange={(e) => pick(e.target.files?.[0])} aria-label="Face drawing" />
      {error && <div className={s.error}>{error}</div>}
      {note && <div className={note.ok ? s.small : s.error}>{note.text}</div>}
      <div className={s.spacer} />
      <div className={s.actions}>
        <Btn tone="accent" onClick={save} disabled={!picked || pending}>{sel.face ? "Replace face" : "Add face"}</Btn>
        {sel.face && (
          <Btn tone="danger" disabled={pending} onClick={() => confirm(`Remove ${sel.name}'s face?`) && run(() => removeFace(sel.id))}>
            Remove
          </Btn>
        )}
      </div>
    </section>
  );
}

function OldFaces({ data, pending, run }: { data: FacesData; pending: boolean; run: (fn: () => Promise<Result>) => void }) {
  const [manual, setManual] = useState<Record<string, string>>({});
  if (!data.old.length) return <p className={s.small}>No faces left from the old catalog. Upload new drawings from the No face tab.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className={s.small} style={{ margin: 0 }}>
        Faces drawn for the old catalog, kept under its teacher ids. Sure matches move by themselves on every deploy; these need a person. Each shows its old name and the closest current professors without a face. Assigning moves the drawing; nothing is re-uploaded.
      </p>
      <div className={s.hstack}>
        <Btn disabled={pending} onClick={() => run(() => transferFaces())}>Move sure matches now</Btn>
      </div>
      {data.old.map((o) => (
        <div key={o.oldId} className={s.card} style={{ gap: 10 }}>
          <div className={s.hstack} style={{ gap: 12 }}>
            <FaceImg src={o.image} size={64} alt={o.oldName ?? ""} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: "1 0 0" }}>
              <span className={s.cardName}>{o.oldName ?? "Unknown name"}</span>
              <span className={s.small}>Old id {o.oldId}</span>
            </div>
          </div>
          {o.matches.length > 0 ? (
            <div className={s.wrap}>
              {o.matches.map((m) => (
                <Btn key={m.id} tone={m === o.matches[0] ? "accent" : "plain"} disabled={pending} onClick={() => run(() => assignOldFace(o.oldId, m.id))}>
                  {m.name} · {m.pct}%
                </Btn>
              ))}
            </div>
          ) : (
            <span className={s.small}>No close name among professors without a face.</span>
          )}
          <div className={s.hstack}>
            <select className={s.inputInline} value={manual[o.oldId] ?? ""} onChange={(e) => setManual((v) => ({ ...v, [o.oldId]: e.target.value }))} aria-label="Assign to another professor">
              <option value="">Another professor…</option>
              {data.choices.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Btn disabled={pending || !manual[o.oldId]} onClick={() => run(() => assignOldFace(o.oldId, manual[o.oldId]))}>Assign</Btn>
            <div className={s.spacer} />
            <Btn tone="danger" disabled={pending} onClick={() => confirm("Discard this old face? It stays in the bucket.") && run(() => discardOldFace(o.oldId))}>Discard</Btn>
          </div>
        </div>
      ))}
    </div>
  );
}
