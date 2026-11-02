import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import { BOT_USERNAME, SITE_URL, path } from "@/core/links";
import { ASSETS_DIR, ogFonts } from "@/server/covers/assets";
import type { CoverMeta } from "@/server/covers/meta";
import { a4Cover } from "@/server/covers/scenes";
import { courseLine, courseOg, fileChip, fileLine, fileOg, nextOg, professorOg, termName, verifyAnonymous, type FileOg, type OgKind } from "@/server/og";
import { AnonymousCard, AppCard, CourseCard, CourseNewCard, FileCard, NextCard, OG, ProfessorCard, RateCard, TelegramCard } from "./_cards";

/** The card element for a request, or the app card when the entity is missing/hidden. */
export async function ogElement(kind: string, id: string | undefined, q: URLSearchParams): Promise<ReactElement> {
  switch (kind as OgKind) {
    case "course":
    case "course-new": {
      const c = id ? await courseOg(id) : null;
      if (!c) return <AppCard />;
      // Numbers only from enough ratings, whatever the URL asks for.
      if (kind === "course-new" || !c.stats) return <CourseNewCard d={c} />;
      return <CourseCard d={{ code: c.code, credits: c.credits, name: c.name, stats: c.stats, line: courseLine(c) }} />;
    }
    case "professor": {
      const p = id ? await professorOg(id) : null;
      if (!p) return <AppCard />;
      return <ProfessorCard d={{ name: p.name, line: p.line, face: await faceData(p.faceKey), pressFPct: p.pressFPct, tags: p.tags }} />;
    }
    case "file": {
      const f = id ? await fileOg(id) : null;
      if (!f) return <AppCard />;
      return <FileCard d={{ chip: fileChip(f), chipTint: f.source === "exam" ? "rust" : f.source === "students" ? "plum" : "mustard", title: f.title, line: fileLine(f), cover: a4Cover(fileCoverMeta(f)) }} />;
    }
    case "rate":
      return <RateCard term={q.get("term")?.slice(0, 20) || termName()} />;
    case "next": {
      const n = id ? await nextOg(id) : null;
      if (!n) return <AppCard />;
      return <NextCard d={n} />;
    }
    case "anonymous": {
      const d = { courseName: q.get("c") ?? "", text: q.get("t") ?? "", replies: Number(q.get("r") ?? 0) };
      // Only text our own metadata signed; anything else gets the app card.
      if (!d.courseName || !d.text || !verifyAnonymous(d, q.get("s"))) return <AppCard />;
      return <AnonymousCard d={d} />;
    }
    case "telegram":
      return <TelegramCard bot={BOT_USERNAME} />;
    default:
      return <AppCard />;
  }
}

export function fileCoverMeta(f: FileOg): CoverMeta {
  return {
    title: f.title,
    courseName: f.courseName,
    courseCode: f.courseCode,
    term: f.term,
    source: f.source,
    kind: f.source === "exam" ? "Past exam" : null,
    week: f.week,
    uploadedAt: f.uploadedAt ? new Date(f.uploadedAt) : null,
    exam: f.source === "exam" ? { name: f.exam ? `${f.exam[0].toUpperCase()}${f.exam.slice(1)}` : null, term: f.term } : null,
    url: `${SITE_URL}${path({ to: "file", id: f.id })}`,
  };
}

let defaultFace: string | undefined;

/** A teacher's drawn face as a data URL (never a photo); a neutral drawn face when there is none. */
async function faceData(key: string | null) {
  if (key) {
    try {
      const { signedUrl } = await import("@/lib/storage");
      const res = await fetch(await signedUrl(key), { signal: AbortSignal.timeout(3000) });
      if (res.ok) return `data:${res.headers.get("content-type") ?? "image/png"};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    } catch {
      // fall through to the default face
    }
  }
  defaultFace ??= `data:image/png;base64,${readFileSync(join(ASSETS_DIR, "face-default.png")).toString("base64")}`;
  return defaultFace;
}

const memo = new Map<string, Uint8Array>();
const MEMO_MAX = 200;

/** PNG bytes of a card, memoised per URL (URLs carry a data digest, so entries never go stale). */
export async function renderOg(kind: string, id: string | undefined, q: URLSearchParams): Promise<Uint8Array> {
  const key = `${kind}/${id ?? ""}?${q}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const res = new ImageResponse(await ogElement(kind, id, q), { ...OG, fonts: ogFonts() });
  const png = new Uint8Array(await res.arrayBuffer());
  if (q.has("v") || q.has("s") || !id) {
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
    memo.set(key, png);
  }
  return png;
}
