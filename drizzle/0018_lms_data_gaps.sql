CREATE TABLE "lms_semesters" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"starts" text,
	"ends" text,
	"calendar" jsonb,
	"calendar_fetched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "course_name" text;--> statement-breakpoint
ALTER TABLE "lms_files" ADD COLUMN "pages" integer;--> statement-breakpoint
ALTER TABLE "lms_files" ADD COLUMN "lms_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lms_files" ADD COLUMN "lms_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lms_teachers" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "lms_teachers" ADD COLUMN "education" jsonb;--> statement-breakpoint
ALTER TABLE "lms_teachers" ADD COLUMN "publications" jsonb;--> statement-breakpoint
ALTER TABLE "lms_teachers" ADD COLUMN "science_direction" text;