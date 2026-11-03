import type { GuestHomeView, TodayView } from "@/server/views";

/**
 * Props of the Today screen: the student's `views.today`, or for someone not
 * signed in the guest home (Figma 1.2) from `views.guestHome`.
 */
export type GuestHomeData = GuestHomeView;

export type TodayData = TodayView | GuestHomeData;

export const isGuest = (d: TodayData): d is GuestHomeData => "guest" in d;
