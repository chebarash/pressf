CREATE TABLE "syllabus_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_code" text NOT NULL,
	"source_key" text NOT NULL,
	"file_id" text,
	"storage_key" text NOT NULL,
	"name" text NOT NULL,
	"origin" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "syllabus_queue_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE INDEX "syllabus_queue_course" ON "syllabus_queue" USING btree ("course_code");--> statement-breakpoint
-- Syllabi the old parser never read: one LMS syllabus PDF per course, and the channel imports filed as syllabi.
INSERT INTO "syllabus_queue" ("course_code", "source_key", "file_id", "storage_key", "name", "origin")
SELECT DISTINCT ON (f."code") f."code", 'lms:' || f."id", f."id", f."storage_key", f."name", 'lms'
FROM "lms_files" f
WHERE f."name" ~* 'syllab' AND lower(coalesce(f."extension", '')) = 'pdf'
  AND NOT EXISTS (SELECT 1 FROM "syllabi" s WHERE s."source_name" = 'lms:' || f."id" OR (s."source_name" = f."name" AND s."course_code" = f."code"))
ORDER BY f."code", f."lms_updated_at" DESC NULLS LAST, f."id"
ON CONFLICT ("source_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "syllabus_queue" ("course_code", "source_key", "file_id", "storage_key", "name", "origin")
SELECT u."course_code", u."source_key", u."id"::text, u."storage_key", u."file_name", 'import'
FROM "uploads" u
WHERE u."type" = 'syllabus' AND u."source_key" IS NOT NULL AND u."storage_key" IS NOT NULL AND u."course_code" IS NOT NULL AND u."status" = 'live'
  AND (u."mime_type" = 'application/pdf' OR u."file_name" ~* '\.pdf$')
  AND NOT EXISTS (SELECT 1 FROM "syllabi" s WHERE s."source_name" = u."source_key")
ON CONFLICT ("source_key") DO NOTHING;
