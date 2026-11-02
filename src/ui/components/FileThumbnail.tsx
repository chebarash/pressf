import { FORMAT_CODE, type FileFormat } from "@/core/files";
import { cx } from "./cx";
import s from "./FileThumbnail.module.css";

export type FileThumbnailProps = {
  format: FileFormat;
  /** Figma Size: L 200×260 cover card · S 40×50 row thumbnail. */
  size?: "l" | "s";
  /** L only. */
  title?: string;
  /** L only, e.g. "MATH 111 · Week 2". */
  meta?: string;
  /** L only, e.g. "12 p". */
  pages?: string;
  /** Real first-page render; replaces the motif (PDF, slides, images). */
  preview?: string;
  className?: string;
};

/** Colour family by format (Figma File/Thumbnail description). */
const FAMILY: Record<FileFormat, "rust" | "teal" | "mustard" | "moss" | "plum" | "sunken" | "surface"> = {
  pdf: "rust",
  word: "teal",
  code: "teal",
  slides: "mustard",
  sheet: "moss",
  image: "plum",
  audio: "plum",
  video: "sunken",
  archive: "sunken",
  link: "surface",
  other: "surface",
};

/** Document cover by file format (Figma File/Thumbnail 4254:45260). */
export function FileThumbnail({ format, size = "l", title, meta, pages, preview, className }: FileThumbnailProps) {
  const code = FORMAT_CODE[format];
  if (size === "s") {
    return (
      <span className={cx(s.thumb, s.s, s[FAMILY[format]], className)} role="img" aria-label={`${code} file`}>
        <span className={s.code}>{code}</span>
        <Fold small />
      </span>
    );
  }
  return (
    <div className={cx(s.thumb, s.l, s[FAMILY[format]], className)}>
      <div className={s.top}>
        <span className={s.badge}>{code}</span>
        {pages ? <span className={s.pages}>{pages}</span> : null}
      </div>
      <div className={s.motif} aria-hidden>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed bucket URL, already sized
          <img src={preview} alt="" className={s.preview} />
        ) : (
          <Motif format={format} />
        )}
      </div>
      <span className={s.spacer} />
      {title ? <p className={s.title}>{title}</p> : null}
      {meta ? <p className={s.meta}>{meta}</p> : null}
      <Fold />
    </div>
  );
}

/** Dog-ear: the page-coloured cut-out plus the folded flap with an ink edge. */
function Fold({ small }: { small?: boolean }) {
  const n = small ? 12 : 24;
  return (
    <svg className={cx(s.fold, small && s.foldS)} width={n + 2} height={n + 2} viewBox={`-1 -1 ${n + 2} ${n + 2}`} aria-hidden>
      <path d={`M-1 -1H${n + 1}V${n + 1}Z`} className={s.cut} />
      <path d={`M0 0V${n}H${n}Z`} className={s.flap} strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
}

type R = [x: number, y: number, w: number, h: number, rx: number, strong?: 1];

const LINES: R[] = [[0, 0, 168, 6, 3, 1], [0, 14, 151.2, 6, 3], [0, 28, 168, 6, 3], [0, 42, 151.2, 6, 3], [0, 56, 92.4, 6, 3]];
const SLIDES: R[] = [[0, 0, 168, 81, 8], [12, 12, 84, 8, 3, 1], [12, 28, 117.6, 5, 3], [12, 39, 100.8, 5, 3], [104.16, 47, 50.4, 24, 4, 1]];
const SHEET: R[] = [0, 15.4, 30.8, 46.2, 61.6].flatMap((y, row) => [0, 42, 84, 126].map((x, col): R => (row === 0 || col === 0 ? [x, y, 39, 12.4, 2, 1] : [x, y, 39, 12.4, 2])));
const AUDIO: Array<[h: number, t: number]> = [[59.861, 10.57], [54.431, 13.28], [37.241, 21.88], [67.855, 6.57], [16.861, 32.07], [65.335, 7.83], [45.315, 17.84], [47.592, 16.7], [64.276, 8.36], [19.704, 30.65], [68.317, 6.34], [34.645, 23.18], [56.283, 12.36], [58.256, 11.37], [31.616, 24.69], [68.67, 6.16], [22.922, 29.04], [62.907, 9.05]];
const AUDIO_R: R[] = AUDIO.map(([h, t], i): R => (i < 7 ? [i * 9.333, t, 6.333, h, 2, 1] : [i * 9.333, t, 6.333, h, 2]));
const ARCHIVE: R[] = [[78, 0, 6, 6, 1, 1], [84, 9, 6, 6, 1, 1], [78, 18, 6, 6, 1, 1], [84, 27, 6, 6, 1, 1], [78, 36, 6, 6, 1, 1], [84, 45, 6, 6, 1, 1], [76, 56, 16, 20, 4, 1]];

const rects = (list: R[]) => list.map(([x, y, w, h, rx, strong], i) => <rect key={i} x={x} y={y} width={w} height={h} rx={rx} className={strong ? s.strong : s.line} />);

function Motif({ format }: { format: FileFormat }) {
  let content: React.ReactNode;
  switch (format) {
    case "slides":
      content = rects(SLIDES);
      break;
    case "sheet":
      content = rects(SHEET);
      break;
    case "audio":
      content = rects(AUDIO_R);
      break;
    case "archive":
      content = rects(ARCHIVE);
      break;
    case "image":
      content = (
        <>
          <rect width="168" height="81" rx="8" className={s.line} />
          <circle cx="142" cy="18" r="7.375" className={s.sun} strokeWidth="1.25" />
          <path d="M58.4 30.78L102.048 68.445H14.7523Z" className={s.strong} />
          <path d="M118.44 44.55L151.176 71.8875H85.7042Z" className={s.strong} />
        </>
      );
      break;
    case "video":
      content = (
        <>
          <rect width="168" height="81" rx="8" className={s.media} />
          <path d="M76 60.5L62.5 69.1603V51.8397Z" className={s.white} />
          <rect x="10" y="71" width="148" height="3" rx="1.5" className={s.line} />
          <rect x="10" y="71" width="51.8" height="3" rx="1.5" className={s.white} />
        </>
      );
      break;
    case "link":
      content = (
        <g className={s.globe} fill="none">
          <circle cx="84" cy="38.5" r="18.5" strokeWidth="3" />
          <ellipse cx="84" cy="38.5" rx="8" ry="19" strokeWidth="2" />
          <rect x="64" y="37.5" width="40" height="2" rx="1" className={s.strong} stroke="none" />
        </g>
      );
      break;
    case "code":
      return (
        <pre className={s.codeText}>
          {"def limit(f, x, h):\n    return f(x + h)\n\n# week 2 practice"}
        </pre>
      );
    default:
      content = rects(LINES);
  }
  return (
    <svg width="168" height="81" viewBox="0 0 168 81" className={s.motifSvg}>
      {content}
    </svg>
  );
}
