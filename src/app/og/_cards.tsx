import type { ReactNode } from "react";
import { C, mascotDataUrl } from "@/server/covers/assets";
import { SceneView } from "@/server/covers/draw";
import { SITE_HOST } from "@/server/covers/meta";
import type { Scene } from "@/server/covers/draw";
import { measure, titleLines, wrap } from "@/server/covers/text";

/**
 * Share previews (og:image, 1200×630) from Figma section 12 · "Share previews
 * and branded file covers". Same layout everywhere: brand strip, one big fact,
 * one line of context. No photos, no student names, no Anonymous authors.
 */

export const OG = { width: 1200, height: 630 };
const INNER = OG.width - 128;

const serif = { fontFamily: "Instrument Serif", fontWeight: 400 } as const;
const sans = (w: 400 | 500 | 600) => ({ fontFamily: "Geologica", fontWeight: w }) as const;

export type Tint = "teal" | "mustard" | "rust" | "plum" | "moss" | "mustardStrong" | "white" | "page";
const TINT: Record<Tint, string> = { teal: C.teal, mustard: C.mustard, rust: C.rust, plum: C.plum, moss: C.moss, mustardStrong: C.mustardStrong, white: C.white, page: C.page };

/** Keycap chip: 2.5 px ink border, 12 px radius, 4 px key shadow. */
export function Chip({ children, tint, size = 20 }: { children: ReactNode; tint: Tint; size?: number }) {
  return (
    <div style={{ display: "flex", padding: "8px 16px", background: TINT[tint], border: `2.5px solid ${C.strong}`, borderRadius: 12, boxShadow: `0 4px 0 ${C.key}`, fontSize: size, ...sans(600), color: C.ink, lineHeight: 1.25 }}>
      {children}
    </div>
  );
}

function Frame({ children, bg = C.page, gap = 16 }: { children: ReactNode; bg?: string; gap?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: OG.width, height: OG.height, padding: "56px 64px", background: bg, color: C.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={mascotDataUrl()} width={56} height={56} />
        <div style={{ display: "flex", fontSize: 40, lineHeight: 1.04, ...serif }}>Press F</div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", fontSize: 22, ...sans(500), color: C.secondary }}>{SITE_HOST}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", alignItems: "flex-start", gap, width: "100%" }}>{children}</div>
    </div>
  );
}

/** Largest serif size (step 4) at which `text` fits `lines` lines of `width`. */
export function fitSerif(text: string, start: number, min: number, width = INNER, lines = 1) {
  for (let size = start; size > min; size -= 4) {
    if (lines === 1 ? measure(text, "serif", size) <= width : wrap(text, "serif", size, width).length <= lines) return size;
  }
  return min;
}

function Title({ children, size, lh = 1.04, color = C.ink }: { children: string; size: number; lh?: number; color?: string }) {
  return <div style={{ display: "flex", fontSize: size, lineHeight: lh, ...serif, color, width: "100%" }}>{children}</div>;
}

function Line({ children, size = 24, weight = 500, color = C.secondary, lh }: { children: ReactNode; size?: number; weight?: 400 | 500 | 600; color?: string; lh?: number }) {
  // A few px of slack: Figma lets a line that measures a hair over the frame stay on one line.
  return <div style={{ display: "flex", fontSize: size, ...sans(weight), color, alignSelf: "stretch", marginRight: -4, ...(lh ? { lineHeight: lh } : {}) }}>{children}</div>;
}

/** OG/App — home, pages without their own card, the bot's link. */
export function AppCard() {
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 104, lineHeight: 0.95, ...serif }}>
        <div style={{ display: "flex" }}>Your NewUU day,</div>
        <div style={{ display: "flex" }}>in one place.</div>
      </div>
      <Line size={28} weight={400} lh={1.25}>Timetable, files by week, grades and absences from LMS — plus what students really think of every course.</Line>
      <div style={{ display: "flex", gap: 12 }}>
        <Chip tint="teal" size={22}>Today</Chip>
        <Chip tint="mustard" size={22}>Files</Chip>
        <Chip tint="moss" size={22}>Grades</Chip>
        <Chip tint="plum" size={22}>Ratings</Chip>
      </div>
    </Frame>
  );
}

export type CourseCardData = {
  code: string;
  /** "Core · 6 ECTS", "6 ECTS". */
  credits?: string | null;
  name: string;
  stats: { recommendPct: number; hours: string; difficulty: string };
  /** "Gonçalo Pinto · Emily Carter — 63 files, 23 Anonymous posts". */
  line?: string | null;
};

/** OG/Course — numbers from ≥ 5 ratings. */
export function CourseCard({ d }: { d: CourseCardData }) {
  const stats: Array<[string, string]> = [[`${d.stats.recommendPct}%`, "would recommend"], [d.stats.hours, "a week outside class"], [d.stats.difficulty, "how hard"]];
  return (
    <Frame>
      <Codes code={d.code} credits={d.credits} />
      <Title size={fitSerif(d.name, 128, 72)}>{d.name}</Title>
      <div style={{ display: "flex", gap: 48 }}>
        {stats.map(([big, small]) => (
          <div key={small} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 64, lineHeight: 1.04, ...serif }}>{big}</div>
            <div style={{ display: "flex", fontSize: 22, ...sans(500), color: C.secondary }}>{small}</div>
          </div>
        ))}
      </div>
      {d.line ? <Line>{d.line}</Line> : null}
    </Frame>
  );
}

function Codes({ code, credits }: { code: string; credits?: string | null }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <Chip tint="teal">{code}</Chip>
      {credits ? <Chip tint="white">{credits}</Chip> : null}
    </div>
  );
}

/** OG/Course · new — fewer than 5 ratings: no numbers, an invitation instead. */
export function CourseNewCard({ d }: { d: Pick<CourseCardData, "code" | "credits" | "name"> }) {
  return (
    <Frame>
      <Codes code={d.code} credits={d.credits} />
      <Title size={fitSerif(d.name, 128, 72)}>{d.name}</Title>
      <Line size={30}>New — not enough ratings yet. Took it? Be one of the first five.</Line>
    </Frame>
  );
}

export type ProfessorCardData = {
  name: string;
  /** "Mathematics · Calculus 1, Calculus 2". */
  line?: string | null;
  /** Drawn face (data URL); never a photo. */
  face: string;
  pressFPct?: number | null;
  tags?: string[];
};

/** OG/Professor — illustrated face, never a photo. */
export function ProfessorCard({ d }: { d: ProfessorCardData }) {
  const stickers: Tint[] = ["mustardStrong", "teal"];
  return (
    <Frame gap={0}>
      <div style={{ display: "flex", alignItems: "center", gap: 40, width: "100%" }}>
        <div style={{ display: "flex", padding: 12, background: C.white, border: `3px solid ${C.strong}`, borderRadius: 32, boxShadow: `0 6px 0 ${C.key}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={d.face} width={200} height={200} style={{ objectFit: "contain" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flexGrow: 1, flexBasis: 0 }}>
          <Title size={fitSerif(d.name, 96, 60, INNER - 268)}>{d.name}</Title>
          {d.line ? <Line>{d.line}</Line> : null}
          {d.pressFPct != null ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <div style={{ display: "flex", fontSize: 88, lineHeight: 1.04, ...serif, color: C.accent }}>{`${d.pressFPct}%`}</div>
              <div style={{ display: "flex", fontSize: 26, ...sans(600) }}>pressed F — would take again</div>
            </div>
          ) : (
            <Line size={26} weight={600} color={C.ink}>Not enough ratings yet. Had a class with them? Press F.</Line>
          )}
          {d.tags?.length ? (
            <div style={{ display: "flex", gap: 10 }}>
              {d.tags.slice(0, 2).map((t, i) => <Chip key={t} tint={stickers[i]} size={18}>{t}</Chip>)}
            </div>
          ) : null}
        </div>
      </div>
    </Frame>
  );
}

export type FileCardData = {
  /** "Week 8 · Past exam". */
  chip: string;
  chipTint: Tint;
  title: string;
  /** "Calculus 1 · PDF · 4 pages · from students". */
  line: string;
  cover: Scene;
};

/** OG/File — title and context only; the file itself only after sign-in. */
export function FileCard({ d }: { d: FileCardData }) {
  const lines = titleLines(d.title, "serif", 84, 697);
  const size = lines.length <= 2 ? 84 : fitSerif(d.title, 80, 48, 697, 3);
  return (
    <Frame gap={0}>
      <div style={{ display: "flex", alignItems: "center", gap: 56, width: "100%" }}>
        <div style={{ display: "flex", width: 319, height: 436, alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", width: 297.5, height: 421, border: `2px solid ${C.strong}`, borderRadius: 4, overflow: "hidden", transform: "rotate(3deg)" }}>
            <div style={{ display: "flex", marginLeft: -2, marginTop: -2 }}>
              <SceneView scene={d.cover} scale={297.5 / d.cover.w} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flexGrow: 1, flexBasis: 0, alignItems: "flex-start" }}>
          <Chip tint={d.chipTint}>{d.chip}</Chip>
          <div style={{ display: "flex", flexDirection: "column", fontSize: size, lineHeight: 0.95, ...serif, width: "100%" }}>
            {titleLines(d.title, "serif", size, 697).map((l, i) => <div key={i} style={{ display: "flex" }}>{l}</div>)}
          </div>
          <Line size={26}>{d.line}</Line>
          <Line size={22} weight={400}>Opens in Press F — sign in with your NewUU account</Line>
        </div>
      </div>
    </Frame>
  );
}

/** OG/Rate semester — shared at semester end. */
export function RateCard({ term }: { term: string }) {
  return (
    <Frame bg={C.mustardStrong}>
      <Title size={fitSerif(`Rate ${term}`, 140, 80)}>{`Rate ${term}`}</Title>
      <Line size={30} color={C.ink} lh={1.25}>{"30 seconds a course, anonymous. Next year's students pick sections by it."}</Line>
      <div style={{ display: "flex", gap: 14 }}>
        <Chip tint="white" size={24}>Yes</Chip>
        <Chip tint="page" size={24}>Not sure</Chip>
        <Chip tint="page" size={24}>No</Chip>
      </div>
    </Frame>
  );
}

export type NextCardData = {
  /** "Spring 2027 · registration opens 12 Nov". */
  chip: string;
  name: string;
  /** Up to two options; the first is highlighted. */
  cohorts: Array<{ label: string; detail?: string | null; score?: string | null }>;
};

/** OG/Next semester — shared in group chats before registration. */
export function NextCard({ d }: { d: NextCardData }) {
  const title = `${d.name} — who to pick`;
  return (
    <Frame>
      <Chip tint="plum">{d.chip}</Chip>
      <Title size={fitSerif(title, 96, 56)}>{title}</Title>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
        {d.cohorts.slice(0, 2).map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 24px", background: i === 0 ? C.teal : C.white, border: `2.5px solid ${C.strong}`, borderRadius: 16, boxShadow: `0 4px 0 ${C.key}`, width: "100%" }}>
            <div style={{ display: "flex", fontSize: 26, ...sans(600) }}>{c.label}</div>
            <div style={{ display: "flex", flexGrow: 1, flexBasis: 0, fontSize: 24, ...sans(400), color: C.secondary }}>{c.detail ?? ""}</div>
            {c.score ? <div style={{ display: "flex", fontSize: 30, ...sans(600), color: C.accent }}>{c.score}</div> : null}
          </div>
        ))}
      </div>
    </Frame>
  );
}

export type AnonymousCardData = { courseName: string; text: string; replies: number };

/** OG/Anonymous post — text only, never who wrote it. */
export function AnonymousCard({ d }: { d: AnonymousCardData }) {
  const quote = `“${d.text.trim()}”`;
  const size = fitSerif(quote, 64, 40, INNER, 3);
  let lines = wrap(quote, "serif", size, INNER);
  if (lines.length > 3) lines = [...lines.slice(0, 2), `${lines[2].replace(/\s*\S*$/, "")}…”`];
  return (
    <Frame>
      <Chip tint="teal">{`Anonymous · ${d.courseName}`}</Chip>
      <div style={{ display: "flex", flexDirection: "column", fontSize: size, lineHeight: 0.95, ...serif, width: "100%" }}>
        {lines.map((l, i) => <div key={i} style={{ display: "flex" }}>{l}</div>)}
      </div>
      <Line size={26}>{`${d.replies} ${d.replies === 1 ? "reply" : "replies"} · read and answer in Press F`}</Line>
    </Frame>
  );
}

/** OG/Open in Telegram — t.me links (desktop "Continue in Telegram", invites). */
export function TelegramCard({ bot }: { bot: string }) {
  return (
    <Frame bg={C.teal}>
      <Title size={100}>Open Press F in Telegram</Title>
      <Line size={30} color={C.ink}>Alerts before class, QR check-in, grades the minute they land.</Line>
      <Chip tint="page" size={26}>{`@${bot}`}</Chip>
    </Frame>
  );
}
