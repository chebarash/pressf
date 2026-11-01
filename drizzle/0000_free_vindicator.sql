CREATE TYPE "public"."material_kind" AS ENUM('syllabus', 'midterm', 'final', 'mock', 'notes', 'textbook');--> statement-breakpoint
CREATE TYPE "public"."material_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "catalog_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"source_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_overrides" (
	"code" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faces" (
	"teacher_id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "material_status" DEFAULT 'pending' NOT NULL,
	"course_code" text,
	"course_name" text,
	"type" "material_kind",
	"term" text,
	"has_solutions" boolean DEFAULT false NOT NULL,
	"author" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"caption" text,
	"telegram_file_id" text,
	"telegram_file_unique_id" text,
	"sha256" text,
	"storage_key" text,
	"original_key" text,
	"submitter_chat_id" text,
	"review_message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "materials_telegram_file_unique_id_unique" UNIQUE("telegram_file_unique_id"),
	CONSTRAINT "materials_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "mention_links" (
	"post_id" integer NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"post_id" integer PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"text" text NOT NULL,
	"date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"teacher_id" text NOT NULL,
	"course_code" text NOT NULL,
	"clarity" integer NOT NULL,
	"engagement" integer NOT NULL,
	"organization" integer NOT NULL,
	"expertise" integer NOT NULL,
	"fair_grading" integer NOT NULL,
	"overall" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "respects" (
	"user_id" uuid NOT NULL,
	"teacher_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_code" text NOT NULL,
	"source_name" text NOT NULL,
	"material_id" uuid,
	"data" jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"matched" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "syllabi_source_name_unique" UNIQUE("source_name")
);
--> statement-breakpoint
CREATE TABLE "teacher_aliases" (
	"old_id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"group" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "mention_links" ADD CONSTRAINT "mention_links_post_id_mentions_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."mentions"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "respects" ADD CONSTRAINT "respects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "materials_course" ON "materials" USING btree ("status","course_code");--> statement-breakpoint
CREATE INDEX "materials_review" ON "materials" USING btree ("review_message_id");--> statement-breakpoint
CREATE INDEX "materials_submitter" ON "materials" USING btree ("submitter_chat_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mention_links_unique" ON "mention_links" USING btree ("post_id","kind","target");--> statement-breakpoint
CREATE INDEX "mention_links_target" ON "mention_links" USING btree ("kind","target");--> statement-breakpoint
CREATE INDEX "mentions_date" ON "mentions" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_user_teacher" ON "ratings" USING btree ("user_id","teacher_id");--> statement-breakpoint
CREATE INDEX "ratings_teacher" ON "ratings" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "ratings_course" ON "ratings" USING btree ("course_code");--> statement-breakpoint
CREATE UNIQUE INDEX "respects_user_teacher" ON "respects" USING btree ("user_id","teacher_id");--> statement-breakpoint
CREATE INDEX "search_events_recent" ON "search_events" USING btree ("created_at","kind");--> statement-breakpoint
CREATE INDEX "syllabi_course" ON "syllabi" USING btree ("course_code","matched");