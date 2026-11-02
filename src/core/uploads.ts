import type { FileType } from "./files";

/**
 * Student uploads arrive through the bot only. A moderator publishes or turns
 * them down with a reason; trusted uploaders go live at once and are spot-checked.
 */

export type UploadStatus = "waiting" | "live" | "rejected" | "hidden";
export type Trust = "normal" | "trusted" | "paused";

export const UPLOAD_TYPES: FileType[] = ["exam", "mock", "notes", "lecture", "other"];

export const REJECT_REASONS = {
  "in-lms": { label: "Already in LMS", message: (t: string) => `They're the official materials — already in the course from LMS.` + (t ? ` (${t})` : "") },
  "live-exam": { label: "Answers to an exam still running", message: () => "It has answers to an exam that is still running. Share it after the exam is over." },
  "personal-data": { label: "Has personal data", message: () => "It shows someone's personal data (names, IDs or phone numbers)." },
  "wrong-course": { label: "Wrong course", message: () => "It doesn't belong to this course. Send it again and pick the right one." },
  unreadable: { label: "Can't read it", message: () => "We couldn't open or read it. A clearer scan or the original file works best." },
  other: { label: "Other — write a note", message: (note: string) => note },
} as const;
export type RejectReason = keyof typeof REJECT_REASONS;

/** The bot message a student gets when an upload is turned down. */
export function rejectMessage(title: string, courseName: string, reason: RejectReason, note = "") {
  const why = REJECT_REASONS[reason].message(note).trim();
  return `Not accepted: ${title} · ${courseName}.\n${why}\nThanks for sharing anyway!`;
}

export const liveMessage = (title: string, courseName: string) =>
  `Your file is live 🎉\n${title} · ${courseName} — marked "From students". Thanks, it helps the next cohort.`;

export type UploadHistory = { live: number; rejected: number; manualTrust?: Trust | null };

/** 5 live uploads and none turned down → trusted, unless a moderator set it by hand. */
export function trustOf(h: UploadHistory): Trust {
  if (h.manualTrust) return h.manualTrust;
  return h.live >= 5 && h.rejected === 0 ? "trusted" : "normal";
}

/**
 * Where a new upload goes. Trusted uploads go live, but 1 in 10 is held for a
 * spot check (`roll` in [0, 1)); paused uploaders cannot send at all.
 */
export function routeUpload(trust: Trust, roll: number): "live" | "waiting" | "refuse" {
  if (trust === "paused") return "refuse";
  if (trust === "trusted") return roll < 0.1 ? "waiting" : "live";
  return "waiting";
}

const ALLOWED: Record<UploadStatus, UploadStatus[]> = {
  waiting: ["live", "rejected"],
  live: ["hidden"],
  rejected: ["live"],
  hidden: ["live"],
};

export const canMove = (from: UploadStatus, to: UploadStatus) => ALLOWED[from].includes(to);

/** "From students", or the name when the uploader chose to show it. */
export const shownAs = (showName: boolean, name?: string | null) => (showName && name ? `From ${name}` : "From students");

/** Exams more recent than this are held for the "exam still running" check. */
export const RECENT_EXAM_DAYS = 3;
