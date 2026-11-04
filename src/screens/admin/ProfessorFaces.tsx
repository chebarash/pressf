"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type RefObject } from "react";
import { buildFace, removeFace, uploadFace, type Result } from "@/app/admin/actions";
import { DEFAULT_NOTION_FACE, isNotionFace, NOTION_FIELDS, NOTION_ROWS, NOTION_TAGS, notionFacePreviewUrl, notionFaceString, notionThumbUrl, notionTileTransform, parseNotionFace, randomNotionFace, type NotionFace, type NotionField } from "@/core/notion-faces";
import type { Suggestions } from "@/core/notion-faces/match";
import type { NotionPart } from "@/core/notion-faces/parts";
import type { facesPage } from "@/server/admin/faces";
import f from "./faces.module.css";
import { Btn, Chip, Head, KV, Label, cx, s } from "./ui";
import { ProfessorTabs } from "./ProfessorProfiles";
import { useKeys } from "./useKeys";
import type { SortColumns } from "@/core/sort";
import { SortHeader, useSortedRows } from "@/ui/table/Sort";

export type FacesData = Awaited<ReturnType<typeof facesPage>>;

const FACE_COLUMNS: SortColumns<FacesData["list"][number], "name" | "courses"> = { name: (t) => t.name, courses: (t) => t.courses };
const DEFAULT_FACE = "/ui/face-default.png";
const MAX_BYTES = 512 * 1024;

/** A drawn face on the page background, at a fixed size. Plain <img>: faces are tiny and cached per version. */
function FaceImg({ src, size, alt = "" }: { src: string | null; size: number; alt?: string }) {
  // Only faces the server stored and linked (/faces/<id>?v=…); nothing from the browser.
  const safe = src && src.startsWith("/faces/") ? src : DEFAULT_FACE;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={safe} alt={alt} width={size} height={size} style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, opacity: safe === DEFAULT_FACE ? 0.35 : 1 }} />;
}

/** A6 Professors · Faces: drawn faces only (never photos). Upload, replace and remove. */
export function ProfessorFaces({ data }: { data: FacesData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const sort = useSortedRows(data.list, FACE_COLUMNS);
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
  ];

  return (
    <>
      <section className={cx(s.main, s.mainFixed)} style={{ width: 560 }}>
        <Head title="Professors" sub={`${data.counts.with} of ${data.total} have a drawn face`} />
        <ProfessorTabs active="faces" />
        <div className={s.tabs}>
          {tabs.map((t) => (
            <Link key={t.id} href={`/admin/professors?tab=faces&show=${t.id}`} className={cx(s.chip, data.show === t.id && s.chipInverse)}>
              {t.label} {t.n}
            </Link>
          ))}
        </div>
        <form className={s.search} action="/admin/professors">
          <input type="hidden" name="tab" value="faces" />
          <input type="hidden" name="show" value={data.show} />
          <input ref={search} name="q" defaultValue={data.q} placeholder="Professor's name" aria-label="Search professors" autoComplete="off" />
          <kbd className={s.key}>/ to filter</kbd>
        </form>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className={cx(s.tr, s.trHead)}>
            <span className={s.td} style={{ width: 32 }} />
            <SortHeader state={sort.state} k="name" className={cx(s.td, s.tdGrow)}>NAME</SortHeader>
            <SortHeader state={sort.state} k="courses" className={s.td} style={{ width: 70 }}>COURSES</SortHeader>
          </div>
          {data.list.length === 0 && <p className={s.small}>{data.q ? `Nobody matches “${data.q}”.` : data.show === "missing" ? "Every professor has a face." : "No faces yet."}</p>}
          {sort.rows.map((t) => (
            <Link key={t.id} href={href({ id: t.id })} className={cx(s.tr, s.trLink, t.id === data.selected?.id && s.trSelected)} prefetch={false} scroll={false}>
              <FaceImg src={t.face} size={32} />
              <span className={cx(s.td, s.tdGrow, s.tdStrong)}>{t.name}</span>
              <span className={s.td} style={{ width: 70 }}>{t.courses}</span>
            </Link>
          ))}
        </div>
      </section>
      {data.selected ? <Detail key={data.selected.id} sel={data.selected} pending={pending} run={run} note={note} /> : <section className={cx(s.detail, s.detailNarrow)} />}
    </>
  );
}

type DetailProps = { sel: NonNullable<FacesData["selected"]>; pending: boolean; run: (fn: () => Promise<Result>) => void; note: { ok: boolean; text: string } | null };

function Detail(props: DetailProps) {
  const [building, setBuilding] = useState(false);
  return building ? <FaceBuilder {...props} close={() => setBuilding(false)} /> : <FaceView {...props} build={() => setBuilding(true)} />;
}

function FaceView({ sel, pending, run, note, build }: DetailProps & { build: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<File | null>(null);

  const pick = (f: File | undefined) => {
    setError(null);
    setPicked(null);
    if (!f) return;
    if (!/\.(png|svg)$/i.test(f.name) && !/^image\/(png|svg\+xml)$/.test(f.type)) return setError("Upload a PNG or an SVG drawing");
    if (f.size > MAX_BYTES) return setError("Faces are line drawings: keep the file under 512 KB");
    setPicked(f);
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
        if (file.current) file.current.value = "";
      }
      return r;
    });
  };
  // The page shows the stored face only: after a save the server links the new version.
  const shown = sel.face;

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
      {picked && <Chip tone="mustard">{`${picked.name} — NOT SAVED YET`}</Chip>}
      <div className={s.cardSoft}>
        <KV k="Position" wide>{sel.position ?? "—"}</KV>
        <KV k="Courses" wide>{sel.courses}</KV>
        <KV k="Face" wide>{sel.face ? `${sel.format} · ${sel.updatedAt ? new Date(sel.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}` : "None — the default face shows"}</KV>
        <KV k="Page" wide><Link href={`/p/${sel.id}`} className={s.link}>/p/{sel.id}</Link></KV>
      </div>
      <Label>DRAWN FACES ONLY</Label>
      <p className={s.small} style={{ margin: 0 }}>
        Build the face from parts, or upload a line drawing of the head in the Press F style: PNG with a transparent background or a plain SVG, about square, 96–2048 px, under 512 KB. Never a photo.
      </p>
      <div className={s.actions}>
        <Btn onClick={build} disabled={pending}>{sel.spec ? "Edit the drawing" : "Build a face"}</Btn>
      </div>
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

/* ───────── Build a face ───────── */

const PREVIEW_SIZES = [120, 64, 48, 32];
const HAIR_STYLES = ["short", "long", "covered"] as const;
const HAIR_COLOURS = ["light", "medium", "dark"] as const;

/**
 * The Notion Faces constructor: Notion's categories as rows of part tiles, in
 * Notion's order. The preview is drawn by the server from the same parts the
 * saved face uses. A face made on faces.notion.com can be pasted as a link.
 */
function FaceBuilder({ sel, pending, run, note, close }: DetailProps & { close: () => void }) {
  // A face drawn with the older constructor (v2) keeps its drawing until this one is saved.
  const [face, setFace] = useState<NotionFace>(isNotionFace(sel.spec) ? sel.spec : DEFAULT_NOTION_FACE);
  const [link, setLink] = useState("");
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photo = usePhotoFace(photoInput, (suggested) => setFace(firstOf(suggested)));
  const src = notionFacePreviewUrl(face);
  const set = (field: NotionField, id: number) => setFace((old) => ({ ...old, [field]: id }));

  const paste = () => {
    const pasted = parseNotionFace(link);
    if (!pasted) return setLinkNote("That isn't a Notion Faces link: copy the address of a face on faces.notion.com");
    setFace(pasted);
    setLink("");
    setLinkNote(null);
  };

  const save = () =>
    run(async () => {
      const r = await buildFace(sel.id, face);
      if (r.ok) {
        photo.clear();
        close();
      }
      return r;
    });

  return (
    <section className={cx(s.detail, s.detailNarrow)} aria-label="Build a face">
      <div className={s.hstack}>
        <h2 className={s.h2} style={{ flex: "1 0 0" }}>{sel.name}</h2>
        <Chip tone="mustard">NOT SAVED YET</Chip>
      </div>
      <div className={s.row2} style={{ gap: 12 }}>
        {(["light", "dark"] as const).map((theme) => (
          <div key={theme} className={cx(f.stage, theme === "dark" && f.stageDark)} aria-label={`${theme} preview`}>
            {PREVIEW_SIZES.map((size) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={size} src={src} alt={theme === "light" && size === 120 ? `${sel.name}, drawn` : ""} width={size} height={size} className={f.face} />
            ))}
          </div>
        ))}
      </div>
      <div className={s.actions}>
        <Btn onClick={() => setFace(randomNotionFace())}>Randomize</Btn>
        <Btn onClick={photo.pick} disabled={photo.busy}>{photo.busy ? "Reading the photo…" : "From a photo"}</Btn>
        <a className={s.link} href={`https://faces.notion.com/?face=${notionFaceString(face)}`} target="_blank" rel="noreferrer">
          Open on Notion Faces
        </a>
      </div>
      <input ref={photoInput} type="file" accept="image/*" hidden onChange={photo.onFile} aria-label="Photo of the professor" />
      {photo.url && (
        <div className={f.photo}>
          {/* The photo, from this browser's memory only (an object URL, revoked when it's cleared); never uploaded. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="" width={56} height={56} />
          <p className={s.small} style={{ margin: 0, flex: "1 0 0" }}>
            {photo.suggested ? "Parts picked from the photo, best first in each row. The photo stays in this browser and is never saved." : "Reading the photo in this browser…"}
          </p>
          <button type="button" className={s.link} onClick={photo.clear}>
            Clear
          </button>
        </div>
      )}
      {photo.error && <div className={s.error}>{photo.error}</div>}
      <form
        className={s.hstack}
        onSubmit={(e) => {
          e.preventDefault();
          paste();
        }}
      >
        <input className={s.input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://faces.notion.com/?face=…" aria-label="Notion Faces link" spellCheck={false} />
        <Btn type="submit" disabled={!link.trim()}>Paste a Notion Faces link</Btn>
      </form>
      {linkNote && <div className={s.error}>{linkNote}</div>}
      <div className={f.parts}>
        {NOTION_ROWS.map((row) => (
          <PartRow key={row.field} row={row} value={face[row.field]} suggested={photo.suggested?.[row.field]} onPick={(id) => set(row.field, id)} />
        ))}
      </div>
      <p className={s.small} style={{ margin: 0 }}>Parts from Notion Faces (faces.notion.com).</p>
      {note && !note.ok && <div className={s.error}>{note.text}</div>}
      <div className={s.spacer} />
      <div className={s.actions}>
        <Btn tone="accent" onClick={save} disabled={pending}>Use this face</Btn>
        <Btn onClick={close} disabled={pending}>Cancel</Btn>
      </div>
    </section>
  );
}

/* ───────── From a photo ───────── */

/** The face of the photo's best suggestions (each category's first). */
const firstOf = (s: Suggestions): NotionFace => ({ v: 3, ...(Object.fromEntries(NOTION_FIELDS.map((f) => [f, s[f][0] ?? 0])) as Record<NotionField, number>) });

/**
 * "From a photo": the admin picks a photo; it is read in this browser only
 * (./photo-face, loaded on first use, with MediaPipe served by this site) and
 * turned into suggested parts. The photo is never uploaded or stored: the
 * file input is emptied, the preview's object URL revoked on clear, on a new
 * photo, on save and when the constructor closes.
 */
function usePhotoFace(input: RefObject<HTMLInputElement | null>, apply: (s: Suggestions) => void) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<Suggestions | null>(null);
  const shown = useRef<string | null>(null);
  const runs = useRef(0);
  const release = () => {
    if (shown.current) URL.revokeObjectURL(shown.current);
    shown.current = null;
  };
  useEffect(() => release, []);

  const clear = () => {
    runs.current++;
    release();
    setUrl(null);
    setSuggested(null);
    setError(null);
    setBusy(false);
  };
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // the input lets go of the file
    if (!file) return;
    clear();
    const run = runs.current;
    shown.current = URL.createObjectURL(file);
    setUrl(shown.current);
    setBusy(true);
    try {
      const { faceFromPhoto } = await import("./photo-face");
      const { suggestions } = await faceFromPhoto(file);
      if (run !== runs.current) return;
      setSuggested(suggestions);
      apply(suggestions);
    } catch (err) {
      if (run !== runs.current) return;
      setError(err instanceof Error && err.name === "PhotoFaceError" ? err.message : "Couldn't read the photo in this browser. Try another photo, or build the face by hand.");
    } finally {
      if (run === runs.current) setBusy(false);
    }
  };
  return { url, busy, error, suggested, clear, onFile, pick: () => input.current?.click() };
}

/** A part's tile: the part on white, zoomed like Notion's. */
function PartTile({ field, part, on, onPick, radio = true }: { field: NotionField; part: NotionPart; on: boolean; onPick: () => void; radio?: boolean }) {
  return (
    <button type="button" {...(radio ? { role: "radio", "aria-checked": on } : { "aria-pressed": on })} aria-label={part.label} title={part.label} className={cx(f.tile, on && f.tileOn)} onClick={onPick}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={notionThumbUrl(field, part.id)} alt="" width={56} height={56} loading="lazy" decoding="async" style={{ transform: notionTileTransform(part) }} />
    </button>
  );
}

/** One category: a "none" tile (all but skin tone) and every part's tile; hair gets Notion's style and colour filters. */
function PartRow({ row, value, suggested, onPick }: { row: (typeof NOTION_ROWS)[number]; value: number; suggested?: number[]; onPick: (id: number) => void }) {
  const [style, setStyle] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  const parts = useMemo(() => row.category.parts.filter((p) => (!style || p.style?.includes(style)) && (!colour || p.color?.includes(colour))), [row, style, colour]);
  const tiles = useRef<HTMLDivElement>(null);
  // Keep the chosen part in view (after Randomize or a pasted link it may be far down the list).
  useEffect(() => {
    const box = tiles.current, on = box?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (box && on) box.scrollTop = Math.max(0, on.offsetTop - 4);
  }, [value]);
  const filter = (tags: readonly string[], on: string | null, set: (t: string | null) => void) =>
    tags.map((t) => (
      <button key={t} type="button" className={cx(s.chip, on === t && s.chipInverse)} aria-pressed={on === t} onClick={() => set(on === t ? null : t)}>
        {NOTION_TAGS[t] ?? t}
      </button>
    ));
  return (
    <div className={f.part} role="radiogroup" aria-label={row.category.label}>
      <span className={f.partLabel}>
        {row.category.label}
        <span className={f.partCount}>{row.category.parts.length}</span>
      </span>
      <div className={f.partBody}>
        {suggested && suggested.length > 0 && (
          <div className={f.suggested} aria-label={`${row.category.label}: from the photo`}>
            <span className={f.suggestedLabel}>From the photo</span>
            <div className={f.suggestedTiles}>
              {suggested.map((id) => {
                const part = row.category.parts.find((p) => p.id === id);
                return part ? (
                  <PartTile key={id} field={row.field} part={part} on={value === id} onPick={() => onPick(id)} radio={false} />
                ) : (
                  <button key={id} type="button" aria-pressed={value === 0} aria-label="None" title="None" className={cx(f.tile, f.tileNone, value === 0 && f.tileOn)} onClick={() => onPick(0)}>
                    None
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {row.field === "hair" && (
          <div className={s.wrap}>
            {filter(HAIR_STYLES, style, setStyle)}
            {filter(HAIR_COLOURS, colour, setColour)}
          </div>
        )}
        <div ref={tiles} className={f.tiles}>
          {row.optional && (
            <button type="button" role="radio" aria-checked={value === 0} aria-label="None" title="None" className={cx(f.tile, f.tileNone, value === 0 && f.tileOn)} onClick={() => onPick(0)}>
              None
            </button>
          )}
          {parts.map((p) => (
            <PartTile key={p.id} field={row.field} part={p} on={value === p.id} onPick={() => onPick(p.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
