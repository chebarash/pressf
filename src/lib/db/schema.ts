import {
  boolean,
  index,
  integer,
  jsonb,
  primaryKey,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  group: text("group"),
  telegramId: text("telegram_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The university catalog harvested from the LMS: courses, teachers, departments
 * and programs for the whole university. This is the source Press F moves to,
 * replacing the bot API. Each row keeps `raw` for fields the UI does not use yet.
 */
export const lmsDepartments = pgTable("lms_departments", {
  id: text("id").primaryKey(),
  code: text("code"),
  parentId: text("parent_id"),
  typeId: text("type_id"),
  name: text("name"),
  shortName: text("short_name"),
});

export const lmsPrograms = pgTable("lms_programs", {
  id: text("id").primaryKey(),
  name: text("name"),
  departmentId: text("department_id"),
  groupId: text("group_id"),
  description: text("description"),
});

export const lmsCourses = pgTable(
  "lms_courses",
  {
    /** LMS subject id. */
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    credits: integer("credits"),
    lectureHours: integer("lecture_hours"),
    labHours: integer("lab_hours"),
    practiceHours: integer("practice_hours"),
    departmentId: text("department_id"),
    semesterId: text("semester_id"),
    raw: jsonb("raw").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    /** When this course's lesson files were last pulled from the LMS (on demand). */
    filesSyncedAt: timestamp("files_synced_at", { withTimezone: true }),
  },
  (t) => [index("lms_courses_code").on(t.code)]
);

/**
 * Lesson materials pulled from the LMS into our bucket, once per file, then
 * served to every student of the course. Official files: no moderation, no
 * Press F cover. Files that vanish from the LMS are kept.
 */
export const lmsFiles = pgTable(
  "lms_files",
  {
    /** LMS material id. */
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull(),
    code: text("code").notNull(),
    lessonId: text("lesson_id"),
    name: text("name").notNull(),
    extension: text("extension"),
    /** LMS file_version; a change means re-download. */
    version: text("version"),
    storageKey: text("storage_key").notNull(),
    size: integer("size"),
    mimeType: text("mime_type"),
    /** PDF page count, read when the file is downloaded; null for other formats. */
    pages: integer("pages"),
    /** The material's own dates in the LMS (upload and last change). */
    lmsCreatedAt: timestamp("lms_created_at", { withTimezone: true }),
    lmsUpdatedAt: timestamp("lms_updated_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lms_files_code").on(t.code), index("lms_files_course").on(t.courseId), index("lms_files_lesson").on(t.lessonId)]
);

export const lmsTeachers = pgTable("lms_teachers", {
  /** LMS employee id. */
  id: text("id").primaryKey(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  surName: text("sur_name"),
  /** Academic position/title from the LMS employee detail (academicStatus.name). */
  position: text("position"),
  /** Department from the LMS employee profile (departmentTree), deepest unit. */
  department: text("department"),
  /** Degrees and publications from the LMS employee profile. Never the photo. */
  education: jsonb("education").$type<LmsTeacherEducation[]>(),
  publications: jsonb("publications").$type<LmsTeacherPublication[]>(),
  /** Research area (science_direction). */
  scienceDirection: text("science_direction"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LmsTeacherEducation = { degree: string | null; field: string | null; institution: string | null; year: string | null };
export type LmsTeacherPublication = { title: string; year: string | null; venue: string | null; url: string | null };

/** A semester phase from `/semester/calendar` (cohort selection, schedule builder, studies, add/drop). */
export type LmsSemesterPhase = {
  kind: "cohort-selection" | "schedule-builder" | "studies" | "add-drop" | "other";
  name: string;
  /** ISO date-times. */
  starts: string;
  ends: string;
};

/**
 * Semesters as the LMS names them, shared by everyone: the name ("Fall 2026"),
 * study dates and the semester calendar phases (fetched once per semester).
 */
export const lmsSemesters = pgTable("lms_semesters", {
  /** LMS semester id. */
  id: text("id").primaryKey(),
  name: text("name"),
  /** Study start and end, YYYY-MM-DD. */
  starts: text("starts"),
  ends: text("ends"),
  calendar: jsonb("calendar").$type<LmsSemesterPhase[]>(),
  calendarFetchedAt: timestamp("calendar_fetched_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LmsCurriculumData = {
  programId: string | null;
  semesters: Array<{ semesterId: string; year: number | null; courses: Array<{ id: string; code: string | null; name: string; ects: number | null }> }>;
};

/**
 * A program cohort's curriculum, keyed by the LMS work-education-plan id (one
 * plan per entry year). Built from students' individual education plans as they
 * sign in, so a cohort fills in over time.
 */
export const lmsCurricula = pgTable("lms_curricula", {
  workEducationPlanId: text("work_education_plan_id").primaryKey(),
  programId: text("program_id"),
  data: jsonb("data").$type<LmsCurriculumData>().notNull(),
  learnerId: text("learner_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Which teacher teaches which course, with the LMS role (Lecture, Laboratory…). */
export const lmsCourseTeachers = pgTable(
  "lms_course_teachers",
  {
    courseId: text("course_id").notNull(),
    teacherId: text("teacher_id").notNull(),
    role: text("role"),
  },
  (t) => [
    uniqueIndex("lms_course_teacher_role").on(t.courseId, t.teacherId, t.role),
    index("lms_course_teacher_teacher").on(t.teacherId),
  ]
);

/**
 * A per-student snapshot of their LMS data (enrollment, timetable, academic
 * record), filled at sign-in and refreshed in the background. Pages read this
 * instead of calling the slow LMS on every render.
 */
export const lmsCache = pgTable("lms_cache", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A student's saved LMS login. The password is sealed by lms/crypto so the
 * server can re-login when the 72h token expires; the token is cached to avoid
 * logging in on every request. `status` goes to "invalid" when a stored login
 * stops working (e.g. the student changed their LMS password), which prompts a
 * fresh password on next sign-in and drops the account from background refresh.
 */
export const lmsAccountStatus = pgEnum("lms_account_status", ["active", "invalid"]);

export const lmsAccounts = pgTable("lms_accounts", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  /** The LMS user id from /users/current, so harvests can attribute a source. */
  lmsUserId: text("lms_user_id"),
  /** Sealed password: v1.<iv>.<tag>.<ciphertext>, base64url. Never stored plain. */
  sealedPassword: text("sealed_password").notNull(),
  token: text("token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  status: lmsAccountStatus("status").notNull().default("active"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SyllabusData = {
  course_code: string;
  course_title: string;
  term: string;
  academic_year: string;
  credits: number | null;
  ects: number | null;
  total_hours: number | null;
  contact_hours_per_week: { lectures: number | null; tutorials: number | null; labs: number | null; raw: string };
  prerequisites: {
    status: "listed" | "none" | "not_stated";
    groups: Array<{ any_of: Array<{ text: string; code: string }> }>;
  };
  description: string;
  learning_outcomes: string[];
  assessment: Array<{ name: string; weight_percent: number | null; timing: string }>;
  workload: Array<{ activity: string; hours: number }>;
  instructors: Array<{ name: string; position: string; email: string; office: string; office_hours: string }>;
  books: Array<{ title: string; authors: string; edition: string; kind: "required" | "recommended" }>;
  topics_by_week: Array<{ week: string; topic: string }>;
  tools: string[];
  attendance_policy: string;
  late_work_policy: string;
};

/** One row per syllabus file. Stays in review until it matches a catalog course. */
export const syllabi = pgTable(
  "syllabi",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseCode: text("course_code").notNull(),
    sourceName: text("source_name").notNull().unique(),
    materialId: uuid("material_id"),
    data: jsonb("data").$type<SyllabusData>().notNull(),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    matched: boolean("matched").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("syllabi_course").on(t.courseCode, t.matched)]
);

/** Admin edits per field. A new syllabus never overwrites them. */
export const courseOverrides = pgTable("course_overrides", {
  code: text("code").primaryKey(),
  data: jsonb("data").$type<Partial<SyllabusData>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teacherAliases = pgTable("teacher_aliases", {
  oldId: text("old_id").primaryKey(),
  teacherId: text("teacher_id").notNull(),
});

export const mentions = pgTable(
  "mentions",
  {
    postId: integer("post_id").primaryKey(),
    url: text("url").notNull(),
    text: text("text").notNull(),
    /** Most posts come without a date, so ordering relies on the post id. */
    date: timestamp("date", { withTimezone: true }),
  },
  (t) => [index("mentions_date").on(t.date)]
);

export const mentionLinks = pgTable(
  "mention_links",
  {
    postId: integer("post_id").notNull().references(() => mentions.postId, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    target: text("target").notNull(),
  },
  (t) => [uniqueIndex("mention_links_unique").on(t.postId, t.kind, t.target), index("mention_links_target").on(t.kind, t.target)]
);

export const faces = pgTable("faces", {
  teacherId: text("teacher_id").primaryKey(),
  storageKey: text("storage_key").notNull(),
  /** The constructor parts the face was built from (src/core/face-parts.ts); null for an uploaded drawing. */
  spec: jsonb("spec").$type<Record<string, string>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Anonymous on purpose: what was opened from search, never by whom. */
export const searchEvents = pgTable(
  "search_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    targetId: text("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("search_events_recent").on(t.createdAt, t.kind)]
);

/* ───────────────────────── Rebuild: shared data for every front end ───────────────────────── */

export const role = pgEnum("role", ["student", "moderator", "admin"]);
export const uploadTrust = pgEnum("upload_trust", ["normal", "trusted", "paused"]);

/** Role and moderation settings per person; absent row = plain student. */
export const userRoles = pgTable("user_roles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  role: role("role").notNull().default("student"),
  /** Set only when a moderator overrides the automatic trust level. */
  manualTrust: uploadTrust("manual_trust"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recommend = pgEnum("recommend", ["yes", "unsure", "no"]);

/**
 * One rating per student, course and semester. `rater` is an HMAC of the user
 * id with a server secret: the student can find and edit their own rating, but
 * the table alone does not say who rated what — not even to admins.
 */
export const courseRatings = pgTable(
  "course_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rater: text("rater").notNull(),
    courseId: text("course_id").notNull(),
    courseCode: text("course_code"),
    term: text("term").notNull(),
    recommend: recommend("recommend").notNull(),
    hours: text("hours"),
    difficulty: integer("difficulty"),
    tags: text("tags").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("course_ratings_once").on(t.rater, t.courseId, t.term), index("course_ratings_course").on(t.courseId), index("course_ratings_code").on(t.courseCode)]
);

/** Per-teacher answers inside a course rating (a course can have several teachers by role). */
export const teacherRatings = pgTable(
  "teacher_ratings",
  {
    ratingId: uuid("rating_id").notNull().references(() => courseRatings.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id").notNull(),
    role: text("role").notNull(),
    pressF: boolean("press_f"),
    tags: text("tags").array().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.ratingId, t.teacherId, t.role] }), index("teacher_ratings_teacher").on(t.teacherId)]
);

/** How many times a student dismissed the rating ask, per semester. */
export const ratingAsks = pgTable(
  "rating_asks",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    dismissals: integer("dismissals").notNull().default(0),
    lastDismissedAt: timestamp("last_dismissed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.term] })]
);

export const uploadStatus = pgEnum("upload_status", ["waiting", "live", "rejected", "hidden"]);

/** Files students share through the bot, reviewed in the admin. */
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    uploaderId: uuid("uploader_id").references(() => users.id, { onDelete: "set null" }),
    courseId: text("course_id").notNull(),
    courseCode: text("course_code"),
    title: text("title").notNull(),
    type: text("type").notNull(),
    exam: text("exam"),
    term: text("term"),
    week: integer("week"),
    showName: boolean("show_name").notNull().default(false),
    status: uploadStatus("status").notNull().default("waiting"),
    rejectReason: text("reject_reason"),
    rejectNote: text("reject_note"),
    /** Automatic checks at intake: duplicates, LMS match, personal data, live exam. */
    checks: jsonb("checks").$type<Record<string, unknown>>().notNull().default({}),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key"),
    telegramFileId: text("telegram_file_id"),
    opens: integer("opens").notNull().default(0),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("uploads_queue").on(t.status, t.createdAt),
    index("uploads_course").on(t.courseId, t.status),
    index("uploads_course_code").on(t.courseCode, t.status),
    index("uploads_uploader").on(t.uploaderId),
    uniqueIndex("uploads_sha").on(t.sha256, t.courseId),
  ]
);

export const reportStatus = pgEnum("report_status", ["open", "hidden", "kept"]);

/** Reports on Anonymous posts and student files. Reporters are HMACs, like raters. */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    reporter: text("reporter").notNull(),
    status: reportStatus("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reports_once").on(t.targetKind, t.targetId, t.reporter), index("reports_open").on(t.status, t.createdAt)]
);

/** The unified feed per student (LMS announcements, grades, absences, files, …). */
export const feedItems = pgTable(
  "feed_items",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    courseId: text("course_id"),
    href: text("href"),
    at: timestamp("at", { withTimezone: true }).notNull(),
    read: boolean("read").notNull().default(false),
    needsAck: boolean("needs_ack").notNull().default(false),
    /** LMS announcements: who posted it and for which course. */
    author: text("author"),
    courseName: text("course_name"),
    /** When the bot delivered it; null = not sent (settings or quiet hours). */
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("feed_items_recent").on(t.userId, t.at)]
);

/** Alert settings and last-seen snapshots (grades, absences) used to detect what is new. */
export const userState = pgTable("user_state", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  alerts: jsonb("alerts").$type<Record<string, boolean>>().notNull().default({}),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One-time codes that carry a session between the desktop and Telegram. Only the HMAC is kept. */
export const linkTokens = pgTable("link_tokens", {
  hash: text("hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/** Every admin and moderator action. Read-only in the admin. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    target: text("target"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_recent").on(t.at)]
);

/** Messages to many students: bot message and, optionally, an in-app banner. */
export const broadcasts = pgTable("broadcasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  audience: jsonb("audience").$type<{ years?: number[]; schools?: string[]; courseIds?: string[]; unrated?: string }>().notNull().default({}),
  text: text("text").notNull(),
  button: jsonb("button").$type<{ label: string; target: string } | null>(),
  bannerUntil: timestamp("banner_until", { withTimezone: true }),
  sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  stats: jsonb("stats").$type<{ targeted?: number; delivered?: number; opened?: number }>().notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The bot's open conversation per private chat: the file being shared and the
 * answers so far. One row per chat; dropped when sent, cancelled or stale.
 */
export const botChats = pgTable(
  "bot_chats",
  {
    chatId: text("chat_id").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    draft: jsonb("draft").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bot_chats_updated").on(t.updatedAt)]
);

/** Telegram's file_id for a file the bot sent once, so the next send needs no upload. */
export const telegramFiles = pgTable("telegram_files", {
  key: text("key").primaryKey(),
  fileId: text("file_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Admin edits to harvested LMS files (rename, type, week, hide). A re-sync
 * never overwrites them; views apply them on top of `lms_files`.
 */
export const fileOverrides = pgTable("file_overrides", {
  fileId: text("file_id").primaryKey(),
  title: text("title"),
  type: text("type"),
  week: integer("week"),
  hidden: boolean("hidden").notNull().default(false),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Small moderation and system flags keyed by (kind, target):
 * - `post-hidden` / `post-mute` on an Anonymous post id (a mute acts on the
 *   post's private author token, never on a person),
 * - `teachers-distinct` on a teacher pair that is not a duplicate,
 * - `signout` on a user id (sessions issued before `at` are void),
 * - `setting` on a key (`maintenance`, `sync-paused`).
 */
export const adminMarks = pgTable(
  "admin_marks",
  {
    kind: text("kind").notNull(),
    target: text("target").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    until: timestamp("until", { withTimezone: true }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.target] })]
);
