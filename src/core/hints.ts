import { uploadLink } from "./links";

/**
 * "First time here" hints: one small line under a screen's title, with one
 * action and a ×. A hint shows on its screen until it is dismissed or its
 * action is used, then never again on any device (signed in: user_state.hints;
 * guests: localStorage). At most one per screen, and none while the screen
 * already shows a banner or notice. Keep the list short: each hint points at a
 * real next step the screen can't show by itself.
 */

export type HintScreen = "timetable" | "course" | "professors" | "notifications" | "progress" | "search";

/** What a screen knows when it asks for its hint. */
export type HintContext = {
  signedIn: boolean;
  desktop: boolean;
  /** Telegram linked to the account. */
  telegramLinked?: boolean;
  /** The course page's code (course hints). */
  courseCode?: string;
  /** The screen shows a banner or notice of its own: no hint then. */
  busy?: boolean;
};

export type HintAction = { label: string; href: string; external?: boolean };

export type HintDef = {
  id: string;
  screen: HintScreen;
  text: string;
  /** One link; using it counts as dismissing the hint. */
  action: ((ctx: HintContext) => HintAction | null) | null;
  /** The first-visit rule: shown on this screen while this holds and the hint was never dismissed. */
  when: (ctx: HintContext) => boolean;
};

export const HINTS: HintDef[] = [
  {
    id: "timetable-google",
    screen: "timetable",
    text: "Get your timetable in Google Calendar.",
    action: () => ({ label: "Set up", href: "/me#calendar" }),
    when: (c) => c.signedIn,
  },
  {
    id: "course-materials",
    screen: "course",
    text: "Have notes or past papers for this course? Send them to the bot and they appear in Files for everyone.",
    action: (c) => ({ label: "Send a file", href: uploadLink(c.courseCode ?? ""), external: true }),
    // The phone's course page has its own "Send to the bot" card.
    when: (c) => c.signedIn && c.desktop && !!c.courseCode,
  },
  {
    id: "professors-press-f",
    screen: "professors",
    text: "The % is Press F: the share of students who would take this professor again.",
    action: (c) => (c.signedIn ? { label: "Rate yours", href: "/rate" } : null),
    when: () => true,
  },
  {
    id: "notifications-telegram",
    screen: "notifications",
    text: "Get these the moment they land: link Telegram for alerts and QR check-in.",
    action: () => ({ label: "Link Telegram", href: "/link" }),
    when: (c) => c.signedIn && c.telegramLinked === false,
  },
  {
    id: "progress-numbers",
    screen: "progress",
    text: "Each course shows its final mark once it is in, until then the LMS rating so far. Absences count down to the course's limit.",
    action: null,
    when: (c) => c.signedIn,
  },
  {
    id: "search-shortcut",
    screen: "search",
    text: "Press ⌘K (Ctrl K) anywhere to search courses, professors and files.",
    action: null,
    when: (c) => c.desktop,
  },
];

export const HINT_IDS = new Set(HINTS.map((h) => h.id));

/** The one hint a screen shows now, or null. */
export function pickHint(screen: HintScreen, ctx: HintContext, dismissed: ReadonlySet<string> | readonly string[]): HintDef | null {
  if (ctx.busy) return null;
  const gone = dismissed instanceof Set ? dismissed : new Set(dismissed as readonly string[]);
  return HINTS.find((h) => h.screen === screen && !gone.has(h.id) && h.when(ctx)) ?? null;
}

/** Stored dismissals (id → ISO time), cleaned: only known ids. */
export const cleanHints = (stored: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!stored || typeof stored !== "object") return out;
  for (const [id, at] of Object.entries(stored as Record<string, unknown>)) if (HINT_IDS.has(id) && typeof at === "string") out[id] = at;
  return out;
};
