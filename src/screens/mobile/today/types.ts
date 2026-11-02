import type { FileType } from "@/core/files";
import type { SchoolsView, TodayView } from "@/server/views";

/**
 * Props of the Today screen: the student's `views.today`, or for someone not
 * signed in the guest home (Figma 1.2), built from public views.
 */
export type GuestHomeData = {
  guest: true;
  schools: SchoolsView["schools"];
  /** Most searched courses; empty until a public popularity view exists. */
  popular: Array<{ code: string; name: string; recommendPct: number | null; href: string; teacher: { id: string; name: string } | null; line: string | null }>;
  /** Newest shared files; empty until a public files view exists. */
  freshFiles: Array<{ id: string; title: string; type: FileType; course: string; date: string | null; source: { label: string; kind: "lms" | "channel" }; href: string }>;
};

export type TodayData = TodayView | GuestHomeData;

export const isGuest = (d: TodayData): d is GuestHomeData => "guest" in d;
