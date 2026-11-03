/**
 * View models: one function per screen family. Each reads Postgres only
 * (lms_cache, the sync snapshot, harvested lms_* tables, our tables), never
 * the LMS, and schedules a background refresh when the student's copy is
 * stale. Screen components take `Awaited<ReturnType<typeof views.x>>`.
 */
export { today, type TodayView, type Banner, type CourseCard, type ExamView, type PhaseView } from "./today";
export { timetable, type TimetableView, type TimetableClass } from "./timetable";
export { myCourses, course, file, type MyCoursesView, type CourseView, type FileView, type Viewer, type TeacherCard, type TermOption, type SyllabusFold, type WeekView, type YouInCourse } from "./courses";
export { professor, professors, type ProfessorView, type ProfessorsView, type ProfessorRow } from "./professor";
export { progress, courseProgress, courseAttendance, assignments, termResults, termHref, type TermResultsView, type TermResultCourse, type ProgressView, type CourseProgressView, type CourseAttendance, type AssignmentsView, type ProgressCourse, type AbsencesView, type ClassMark } from "./progress";
export { guestHome, type GuestHomeView, type GuestCourse, type GuestFile } from "./guest";
export { notifications, type NotificationsView, type FeedFilter } from "./notifications";
export { calendar, LAYERS, type CalendarView, type CalendarEvent, type CalendarLayer } from "./calendar";
export { search, type SearchView } from "./search";
export { curriculum, schools, nextSemester, cohorts, type CurriculumView, type SchoolsView, type NextSemesterView, type NextCourse, type Cohort } from "./curriculum";
export { profile, myUploads, type ProfileView, type MyUploadView } from "./profile";
export { rateQueue, type RateQueueView, type RateItem, type RatedItem, type RateAsk, type RateTeacher } from "./rate";
export type { ClassView } from "./classes";
export type { FileItem, FeedView, DeadlineView, MentionsView, MentionView, RatingSummaryView } from "./shared";
export type { SyncState } from "./student";
export { TAGS, invalidate, invalidateRating, invalidateUpload, invalidateHarvest } from "./cache";
