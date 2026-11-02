CREATE TABLE "lms_files" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"code" text NOT NULL,
	"lesson_id" text,
	"name" text NOT NULL,
	"extension" text,
	"version" text,
	"storage_key" text NOT NULL,
	"size" integer,
	"mime_type" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lms_courses" ADD COLUMN "files_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "lms_files_code" ON "lms_files" USING btree ("code");