CREATE TABLE "lms_course_teachers" (
	"course_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"role" text
);
--> statement-breakpoint
CREATE TABLE "lms_courses" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"credits" integer,
	"lecture_hours" integer,
	"lab_hours" integer,
	"practice_hours" integer,
	"department_id" text,
	"semester_id" text,
	"raw" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lms_departments" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text,
	"parent_id" text,
	"type_id" text,
	"name" text,
	"short_name" text
);
--> statement-breakpoint
CREATE TABLE "lms_programs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"department_id" text,
	"group_id" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "lms_teachers" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"sur_name" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "lms_course_teacher_role" ON "lms_course_teachers" USING btree ("course_id","teacher_id","role");--> statement-breakpoint
CREATE INDEX "lms_course_teacher_teacher" ON "lms_course_teachers" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "lms_courses_code" ON "lms_courses" USING btree ("code");