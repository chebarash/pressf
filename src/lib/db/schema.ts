import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const MATERIAL_KINDS = [
  "syllabus",
  "midterm",
  "final",
  "mock",
  "notes",
  "textbook",
] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export const materialStatus = pgEnum("material_status", [
  "pending",
  "approved",
  "rejected",
]);
export const materialKind = pgEnum("material_kind", MATERIAL_KINDS);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  group: text("group"),
  telegramId: text("telegram_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id").notNull(),
    courseCode: text("course_code").notNull(),
    clarity: integer("clarity").notNull(),
    engagement: integer("engagement").notNull(),
    organization: integer("organization").notNull(),
    expertise: integer("expertise").notNull(),
    fairGrading: integer("fair_grading").notNull(),
    overall: real("overall").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ratings_user_teacher").on(t.userId, t.teacherId),
    index("ratings_teacher").on(t.teacherId),
    index("ratings_course").on(t.courseCode),
  ]
);

export const respects = pgTable(
  "respects",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id").notNull(),
  },
  (t) => [uniqueIndex("respects_user_teacher").on(t.userId, t.teacherId)]
);

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: materialStatus("status").notNull().default("pending"),
    courseCode: text("course_code"),
    courseName: text("course_name"),
    type: materialKind("type"),
    term: text("term"),
    hasSolutions: boolean("has_solutions").notNull().default(false),
    author: text("author"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    caption: text("caption"),
    telegramFileId: text("telegram_file_id"),
    telegramFileUniqueId: text("telegram_file_unique_id").unique(),
    sha256: text("sha256").unique(),
    storageKey: text("storage_key"),
    originalKey: text("original_key"),
    /** Kept only until review so the sender can hear the outcome. */
    submitterChatId: text("submitter_chat_id"),
    reviewMessageId: integer("review_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("materials_course").on(t.status, t.courseCode),
    index("materials_review").on(t.reviewMessageId),
    index("materials_submitter").on(t.submitterChatId, t.createdAt),
  ]
);

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
    date: timestamp("date", { withTimezone: true }).notNull(),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Copy of the bot API, so the site opens when the bot is down. */
export const catalogCache = pgTable("catalog_cache", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull(),
  /** The bot's build date, shown when the data goes stale. */
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
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
