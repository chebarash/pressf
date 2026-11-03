/**
 * Screen props for Mobile B: the view models from src/server/views, plus the
 * route-level bits a screen needs (which tab, which sheet is open, a toast).
 */
import type { Hours, Recommend, TeacherRole, TeacherTag, CourseTag } from "@/core/ratings";
import type { CourseView, FileView, MyCoursesView, NextSemesterView, RateItem, RateQueueView, TimetableView } from "@/server/views";
import type { myUploads } from "@/server/views";

export type { FileItem, MentionView, RatingSummaryView, WeekView, TermOption, TeacherCard, SyllabusFold, YouInCourse, RateItem, RatedItem, NextCourse, Cohort, MyUploadView } from "@/server/views";
export type { TimetableView, MyCoursesView, FileView, NextSemesterView, CourseView, RateQueueView };

export type TimetableClass = TimetableView["classes"][number];

export type CourseTab = "overview" | "files" | "anonymous";
export type CourseScreen = CourseView & { tab: CourseTab; notice?: "rating-sent" | null };

export type RateDraft = { recommend: Recommend | null; hours: Hours | null; difficulty: 1 | 2 | 3 | 4 | 5 | null; tags: CourseTag[]; teachers: Array<{ teacherId: string; role: TeacherRole; pressF: boolean | null; tags: TeacherTag[] }> };

export type RateScreen = RateQueueView & {
  /** The course whose sheet is open (/rate/[courseId]). */
  open: { item: RateItem; draft: RateDraft | null; mode: "queue" | "single"; returnHref: string } | null;
  notice?: "rating-sent" | null;
};

export type NextScreen = NextSemesterView & { open: string | null };

export type UploadsView = Awaited<ReturnType<typeof myUploads>>;
